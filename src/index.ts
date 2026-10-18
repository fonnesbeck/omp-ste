import type { ExtensionAPI, ExtensionContext, ExtensionReplyDetails, MessageStartEvent } from "@oh-my-pi/pi-coding-agent";
import { blankCommitMetadata, findCommitInvocations } from "agent-simple-english/src/adapter/commit-message.ts";
import { formatViolations, splitViolations, violationDetails } from "agent-simple-english/src/adapter/feedback.ts";
import { formatFailedStatusSummary, formatStatusSummary, ruleSummary } from "agent-simple-english/src/adapter/rule-summary.ts";
import { classifyPath } from "agent-simple-english/src/engine/kinds.ts";
import { lint } from "agent-simple-english/src/engine/lint.ts";
import type { LintKind, LintOptions, LintReport, Violation } from "agent-simple-english/src/engine/types.ts";
import { loadEngine, type Engine } from "./engine.ts";
import { filterOutput, type OutputState } from "./output.ts";

interface SessionState extends OutputState {
  engine?: Engine;
  error?: string;
  pendingReplyFeedback?: string;
  readonly pendingWarnings: Map<string, string>;
  approvedThisRun: boolean;
}

interface SayDetails extends ExtensionReplyDetails {
  steApproved: boolean;
}

type DisplayMessage = MessageStartEvent["message"];

const COMPLETIONS = [
  { value: "on", label: "on", description: "Enable writing-rule enforcement" },
  { value: "off", label: "off", description: "Disable writing-rule enforcement" },
  { value: "status", label: "status", description: "Show writing-rule status" },
  { value: "strict", label: "strict", description: "Enable strict reply gating" },
  { value: "strict on", label: "strict on", description: "Enable strict reply gating" },
  { value: "strict off", label: "strict off", description: "Disable strict reply gating" },
];

const STRICT_MODE_NOTE = [
  "## Writing rules: strict mode",
  "Send every user-facing reply through the `say` tool.",
  "Write no prose outside that tool. Call `say` as your final action.",
  "A hard violation blocks the call before the user reads the text.",
  "Read the feedback, rewrite the text, and call `say` again.",
].join("\n\n");

function unavailable(state: SessionState): string {
  return `Writing-rule check is unavailable: ${state.error ?? "session setup is not complete"}`;
}

function requireEngine(state: SessionState): Engine {
  if (state.engine === undefined) throw new Error(unavailable(state));
  return state.engine;
}

function lintText(state: SessionState, kind: LintKind, text: string, options: Pick<LintOptions, "previousText" | "sourceDialect"> = {}): LintReport {
  const engine = requireEngine(state);
  try {
    return lint(kind, text, { ...engine.config, dictionary: engine.dictionary, ruleData: engine.ruleData, tagger: engine.tagger, ...options });
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
    state.engine = undefined;
    throw new Error(unavailable(state));
  }
}

function showReport(state: SessionState, ctx: ExtensionContext, report: LintReport, queueFeedback: boolean): void {
  const { hard } = splitViolations(report.violations);
  state.pendingReplyFeedback = queueFeedback && hard.length > 0
    ? `Writing-rule feedback for your previous reply:\n${violationDetails(hard)}`
    : undefined;
  if (ctx.hasUI) {
    const status = report.summary.total === 0
      ? "Writing-rule reply: clean"
      : `Writing-rule reply: ${report.summary.hard} hard, ${report.summary.total - report.summary.hard} soft`;
    ctx.ui.setWidget("simple-english-reply", [status]);
  }
}

function updateReply(state: SessionState, ctx: ExtensionContext, text?: string): void {
  state.pendingReplyFeedback = undefined;
  if (!state.enabled || text === undefined) {
    if (ctx.hasUI) ctx.ui.setWidget("simple-english-reply", undefined);
    return;
  }
  try {
    showReport(state, ctx, lintText(state, "prose-file", text), !state.strict);
  } catch {
    if (ctx.hasUI) ctx.ui.setWidget("simple-english-reply", [unavailable(state)]);
  }
}

function restoreReply(state: SessionState, ctx: ExtensionContext): void {
  const branch = ctx.sessionManager.getBranch();
  for (let index = branch.length - 1; index >= 0; index--) {
    const entry = branch[index];
    if (entry?.type !== "message") continue;
    const message: DisplayMessage = entry.message;
    if (message.role !== "assistant" && (message.role !== "toolResult" || message.toolName !== "say" || message.isError)) continue;
    const text = message.content.flatMap((block) => block.type === "text" ? [block.text] : []).join("\n");
    if (text.length === 0) continue;
    updateReply(state, ctx, text);
    return;
  }
  updateReply(state, ctx);
}

function warnings(state: SessionState, ctx: ExtensionContext, id: string, path: string, violations: readonly Violation[]): void {
  if (violations.length === 0) return;
  const text = formatViolations(path, "Writing-rule warnings for", violations);
  if (ctx.hasUI) ctx.ui.notify(text, "warning");
  const previous = state.pendingWarnings.get(id);
  state.pendingWarnings.set(id, previous === undefined ? text : `${previous}\n\n${text}`);
}

export default function simpleEnglishExtension(pi: ExtensionAPI): void {
  if (typeof pi.registerFileWriteGuard !== "function" || typeof pi.registerOutputFilter !== "function") {
    throw new Error("omp-ste requires the companion omp host patch with registerFileWriteGuard and registerOutputFilter. Stock omp 18.11/18.12 cannot safely enforce writing rules or strict reply privacy.");
  }

  // SessionManager can switch its underlying session; key by session ID, not object identity.
  const states = new Map<string, SessionState>();
  const stateFor = (ctx: ExtensionContext): SessionState => {
    const id = ctx.sessionManager.getSessionId();
    let state = states.get(id);
    if (state === undefined) {
      state = { enabled: true, strict: false, approvedSayReplies: new Map(), pendingWarnings: new Map(), approvedThisRun: false };
      states.set(id, state);
    }
    return state;
  };
  const setSayActive = (active: boolean): void => {
    const tools = pi.getActiveTools().filter((name) => name !== "say");
    pi.setActiveTools(active ? [...tools, "say"] : tools);
  };
  const loadSession = async (ctx: ExtensionContext): Promise<void> => {
    const state = stateFor(ctx);
    state.engine = undefined;
    state.error = undefined;
    state.pendingReplyFeedback = undefined;
    state.pendingWarnings.clear();
    state.approvedSayReplies.clear();
    for (const entry of ctx.sessionManager.getEntries()) {
      if (entry.type !== "message") continue;
      const message = entry.message;
      if (message.role !== "toolResult" || message.toolName !== "say" || message.isError) continue;
      if (typeof message.details !== "object" || message.details === null || !("steApproved" in message.details) || message.details.steApproved !== true) continue;
      const text = message.content.filter((block) => block.type === "text").map((block) => block.text).join("\n");
      state.approvedSayReplies.set(message.toolCallId, text);
    }
    state.approvedThisRun = false;
    setSayActive(state.enabled && state.strict);
    try {
      state.engine = await loadEngine(ctx.cwd, ctx.isProjectTrusted());
    } catch (error) {
      state.error = error instanceof Error ? error.message : String(error);
      if (ctx.hasUI) ctx.ui.notify(`Simple English extension failed to start: ${state.error}`, "error");
    }
    restoreReply(state, ctx);
  };

  pi.registerOutputFilter((event, ctx) => filterOutput(stateFor(ctx), event));
  pi.registerFileWriteGuard((request, ctx) => {
    const state = stateFor(ctx);
    if (!state.enabled) return;
    requireEngine(state);
    const classification = classifyPath(request.path);
    if (classification.skipped) return;
    const report = lintText(state, classification.kind, request.content, {
      sourceDialect: classification.sourceDialect,
      ...(request.operation === "edit" ? { previousText: request.previousText } : {}),
    });
    const { hard, soft } = splitViolations(report.violations);
    warnings(state, ctx, request.toolCallId, request.path, soft);
    if (hard.length > 0) throw new Error(formatViolations(request.path, `Writing rules blocked ${request.operation} for`, hard));
  });

  pi.registerCommand("ste", {
    description: "Toggle writing rules, show status, or gate replies with strict mode.",
    getArgumentCompletions: (prefix) => {
      const matches = COMPLETIONS.filter((item) => item.value.startsWith(prefix));
      return matches.length === 0 ? null : matches;
    },
    handler: async (args, ctx) => {
      const state = stateFor(ctx);
      const command = args.trim().toLowerCase();
      if (command === "status") {
        const mode = !state.enabled ? "disabled" : state.strict ? "strict" : "enabled";
        ctx.ui.notify(state.engine === undefined
          ? formatFailedStatusSummary(mode, state.error ?? "session setup is not complete")
          : formatStatusSummary(state.engine.config, mode, "loaded"), "info");
        return;
      }
      if (command === "strict" || command === "strict on") {
        state.enabled = true;
        state.strict = true;
        state.pendingReplyFeedback = undefined;
        setSayActive(true);
        ctx.ui.notify("Writing-rule strict mode enabled. Send every reply through the say tool.", "info");
        return;
      }
      if (command === "strict off") {
        state.strict = false;
        setSayActive(false);
        ctx.ui.notify("Writing-rule strict mode disabled.", "info");
        return;
      }
      if (command !== "" && command !== "on" && command !== "off") {
        ctx.ui.notify("Usage: /ste [on|off|status|strict|strict on|strict off]", "warning");
        return;
      }
      state.enabled = command === "on" || (command === "" && !state.enabled);
      if (!state.enabled) {
        state.strict = false;
        state.pendingReplyFeedback = undefined;
        state.pendingWarnings.clear();
        setSayActive(false);
        if (ctx.hasUI) ctx.ui.setWidget("simple-english-reply", undefined);
      } else restoreReply(state, ctx);
      ctx.ui.notify(`Writing-rule enforcement ${state.enabled ? "enabled" : "disabled"}.`, "info");
    },
  });

  const sayParameters = pi.zod.object({ text: pi.zod.string().describe("The complete user-facing reply") });
  pi.registerTool<typeof sayParameters, SayDetails>({
    name: "say",
    label: "Say",
    description: "Send the complete user-facing reply after writing-rule approval. In strict mode, use this as your final action; never write reply prose outside this tool.",
    parameters: sayParameters,
    defaultInactive: true,
    approval: "read",
    loadMode: "essential",
    async execute(toolCallId, params, _signal, _onUpdate, ctx) {
      const state = stateFor(ctx);
      if (state.enabled && state.strict) {
        state.approvedSayReplies.delete(toolCallId);
        const report = lintText(state, "prose-file", params.text);
        showReport(state, ctx, report, false);
        const { hard } = splitViolations(report.violations);
        if (hard.length > 0) throw new Error(formatViolations("reply", "Writing rules blocked", hard));
        state.approvedSayReplies.set(toolCallId, params.text);
        state.approvedThisRun = true;
      } else if (state.enabled) updateReply(state, ctx, params.text);
      return { content: [{ type: "text", text: params.text }], details: { steApproved: true, displayAsReply: true, terminateTurn: true } };
    },
    renderCall: () => new pi.pi.Text("Reply pending writing-rule approval", 0, 0),
    renderResult: (result) => new pi.pi.Text(result.details?.steApproved === true
      ? result.content.filter((block) => block.type === "text").map((block) => block.text).join("\n")
      : "Reply not approved.", 0, 0),
  });

  pi.on("session_start", async (_event, ctx) => { await loadSession(ctx); });
  pi.on("session_switch", async (_event, ctx) => { await loadSession(ctx); });
  pi.on("session_branch", async (_event, ctx) => { await loadSession(ctx); });
  pi.on("session_tree", (_event, ctx) => { restoreReply(stateFor(ctx), ctx); });
  pi.on("session_shutdown", () => { states.clear(); });

  pi.on("before_agent_start", (event, ctx) => {
    const state = stateFor(ctx);
    state.approvedThisRun = false;
    if (!state.enabled) return;
    const additions = [ruleSummary(state.engine?.config ?? {})];
    if (state.engine === undefined) additions.push(unavailable(state));
    if (state.strict) additions.push(STRICT_MODE_NOTE);
    return { systemPrompt: [...event.systemPrompt, ...additions] };
  });
  pi.on("assistant_message", (event, ctx) => {
    const state = stateFor(ctx);
    if (!state.enabled || !state.strict) return;
    return { content: event.message.content.map((block) => block.type === "text" ? { ...block, text: "" } : block) };
  });
  pi.on("session_stop", (_event, ctx) => {
    const state = stateFor(ctx);
    if (!state.enabled || !state.strict || state.approvedThisRun) return;
    return { continue: true, additionalContext: "Your reply was not delivered. Strict writing-rule mode requires an approved say call. Call say with the complete reply; if it is rejected, use the tool feedback to revise and call say again. Do not write prose outside say." };
  });
  pi.on("turn_end", (event, ctx) => {
    const state = stateFor(ctx);
    if (!state.enabled || state.strict || event.message.role !== "assistant") return;
    if (event.message.content.some((block) => block.type === "toolCall")) return;
    const text = event.message.content.filter((block) => block.type === "text").map((block) => block.text).join("\n");
    if (text.length > 0) updateReply(state, ctx, text);
  });
  pi.on("context", (event, ctx) => {
    const state = stateFor(ctx);
    if (!state.enabled || state.pendingReplyFeedback === undefined) return;
    const feedback = state.pendingReplyFeedback;
    state.pendingReplyFeedback = undefined;
    return { messages: [...event.messages, { role: "custom" as const, customType: "simple-english-reply-feedback", content: feedback, display: false, timestamp: Date.now() }] };
  });
  pi.on("tool_call", (event, ctx) => {
    const state = stateFor(ctx);
    if (!state.enabled || event.toolName !== "bash") return;
    const command = event.input.command;
    if (typeof command !== "string") return;
    const invocations = findCommitInvocations(command);
    if (invocations.length === 0) return;
    try {
      requireEngine(state);
      for (const invocation of invocations) {
        if (invocation.requiresExplicitMessage) {
          return { block: true, reason: "Writing rules could not check the git commit message. Use git commit with a static -m or --message argument." };
        }
        const report = lintText(state, "commit-message", blankCommitMetadata(invocation.message));
        const { hard, soft } = splitViolations(report.violations);
        warnings(state, ctx, event.toolCallId, "commit message", soft);
        if (hard.length > 0) return { block: true, reason: formatViolations("commit message", "Writing rules blocked commit for", hard) };
      }
    } catch (error) {
      return { block: true, reason: error instanceof Error ? error.message : String(error) };
    }
  });
  pi.on("tool_result", (event, ctx) => {
    const state = stateFor(ctx);
    const warning = state.pendingWarnings.get(event.toolCallId);
    if (warning === undefined) return;
    state.pendingWarnings.delete(event.toolCallId);
    return { content: [...event.content, { type: "text" as const, text: warning }] };
  });
}
