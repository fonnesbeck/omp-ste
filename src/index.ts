import { homedir } from "node:os";
import { extname, resolve } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import {
  check, format, lint, loadConfig, newEngine, promptText, replyFaults,
  replySubject, ruleNames, summarise, warnReason,
  type Config, type Engine, type Violation,
} from "./engine.ts";
import { subjectsOf } from "./subjects.ts";
import { configureStatusBar } from "./status.ts";

const STRICT_NOTE = [
  "## Simplified Technical English: strict mode",
  "Send every user-facing reply through the `say` tool.",
  "Write no prose outside that tool.",
  "A hard violation blocks the call. Read the reason, rewrite the text, then call the tool again.",
].join("\n");
const NOTE_CAP = 3;
const COMMANDS = ["on", "off", "status", "strict", "strict on", "strict off", "mode operational", "mode authored"];

interface State {
  engine: Engine;
  fault?: string;
  enabled: boolean;
  strict: boolean;
  mode: "operational" | "authored";
  authoredPath?: string;
  pending: Violation[];
  notes: number;
  warnings: Map<string, string>;
}

/** A port of agent-ste's pi extension, using only stock omp extension hooks. */
export default async function steExtension(pi: ExtensionAPI): Promise<void> {
  if (pi.pi.Settings.current) {
    await pi.pi.Settings.current;
    await configureStatusBar(pi, process.cwd());
  }
  const states = new Map<string, State>();

  function stateFor(ctx: ExtensionContext): State {
    const id = ctx.sessionManager.getSessionId();
    let state = states.get(id);
    if (!state) {
      let config: Config = { rules: {} };
      let fault: string | undefined;
      try {
        config = loadConfig(ctx.cwd, ruleNames());
      } catch (error) {
        // Match upstream pi: report broken settings and use built-in severities.
        fault = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(`STE config: ${fault}. Using built-in severities.`, "warning");
      }
      state = { engine: newEngine(config), fault, enabled: true, strict: false, mode: "operational",
        pending: [], notes: 0, warnings: new Map() };
      states.set(id, state);
    }
    return state;
  }

  function report(ctx: ExtensionContext, violations: Violation[]): void {
    const { hard, soft } = summarise(violations);
    ctx.ui.setStatus("ste", hard + soft === 0 ? "✓ STE" : `${hard ? "×" : "△"} STE: ${hard} hard / ${soft} soft`);
  }

  function flush(state: State, mode: "steer" | "nextTurn"): void {
    if (state.pending.length === 0 || (mode === "steer" && state.notes >= NOTE_CAP)) return;
    const violations = state.pending;
    state.pending = [];
    if (mode === "steer") state.notes += 1;
    pi.sendMessage({
      customType: "ste-violation",
      content: `Your previous reply broke Simplified Technical English ${violations.length} time(s):\n` +
        `${format(violations)}\nCorrect this in your next reply. Do not apologise for it.`,
      display: true,
      details: { violations },
    }, { deliverAs: mode });
  }

  pi.registerCommand("ste", {
    description: "Choose the task mode and reply checks. Use status to show settings.",
    getArgumentCompletions: (prefix) => {
      const matches = COMMANDS.filter(value => value.startsWith(prefix)).map(value => ({ value, label: value }));
      return matches.length === 0 ? null : matches;
    },
    handler: async (args, ctx) => {
      const state = stateFor(ctx);
      const argument = args.trim();
      const word = argument.toLowerCase();
      if (word === "status") {
        const mode = !state.enabled ? "disabled" : state.strict ? "strict" : "enabled";
        const overrides = Object.entries(state.engine.rules).map(([name, severity]) => `${name}: ${severity}`);
        ctx.ui.notify([`STE ${mode}. Task mode: ${state.mode}.`,
          ...(state.authoredPath ? [`Authored document: ${state.authoredPath}`] : []),
          ...(state.fault ? [`Config error: ${state.fault}. Using built-in severities.`] : []),
          ...(overrides.length ? overrides : ["Built-in rule severities."])].join("\n"), "info");
        return;
      }
      const taskMode = /^mode (operational|authored)(?:\s+(.+))?$/i.exec(argument);
      if (taskMode) {
        const mode = taskMode[1]!.toLowerCase() as State["mode"];
        const path = taskMode[2];
        if (path && (mode !== "authored" || path.includes("://") ||
          ![".md", ".mdx", ".markdown", ".txt", ".rst"].includes(extname(path).toLowerCase()))) {
          ctx.ui.notify("Use a local document path with a supported extension.", "warning");
          return;
        }
        state.enabled = true;
        state.mode = mode;
        state.authoredPath = path ? resolve(ctx.cwd, path.startsWith("~/") ? resolve(homedir(), path.slice(2)) : path) : undefined;
      } else if (word === "strict" || word === "strict on") {
        state.enabled = true;
        state.strict = true;
      } else if (word === "strict off") {
        state.strict = false;
      } else if (word === "" || word === "on" || word === "off") {
        state.enabled = word === "" ? !state.enabled : word === "on";
        if (!state.enabled) {
          state.strict = false;
          state.mode = "operational";
          state.authoredPath = undefined;
          state.pending = [];
          state.warnings.clear();
          state.notes = 0;
        }
      } else {
        ctx.ui.notify("Usage: /ste [on|off|status|strict [on|off]|mode operational|mode authored [document-path]]", "warning");
        return;
      }
      start(ctx);
      ctx.ui.notify(!state.enabled ? "STE disabled" :
        `STE task mode: ${state.mode}. ${state.strict ? "Strict replies use say." : "Reply checks remain active."}` +
        (state.authoredPath ? `\nAuthored document: ${state.authoredPath}` : ""), "info");
    },
  });

  const parameters = pi.zod.object({ text: pi.zod.string().describe("The text to check or send") });
  pi.registerTool({
    name: "ste_lint",
    label: "STE lint",
    description: "Check text against Simplified Technical English before writing prose, a comment, or a commit message.",
    parameters,
    approval: "read",
    loadMode: "essential",
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const violations = lint(stateFor(ctx).engine, params.text);
      const { hard, soft } = summarise(violations);
      return {
        content: [{ type: "text", text: violations.length === 0 ? "No violation." : `${hard} hard, ${soft} soft:\n${format(violations)}` }],
        details: { violations },
      };
    },
  });
  const sayParameters = pi.zod.object({
    text: pi.zod.string().describe("The text to check or send"),
    authored: pi.zod.boolean().optional().describe("True only for requested authored prose in authored mode"),
  });
  pi.registerTool({
    name: "say",
    label: "Say",
    description: "Send prose to the user. Strict mode uses this for every reply. Only authored mode accepts authored output.",
    parameters: sayParameters,
    approval: "read",
    loadMode: "essential",
    async execute(_id, params) {
      return { content: [{ type: "text", text: params.text }], details: {} };
    },
    renderCall: () => new pi.pi.Text("Say", 0, 0),
    renderResult: (result) => new pi.pi.Text(result.content.filter(part => part.type === "text").map(part => part.text).join("\n"), 0, 0),
  });

  function start(ctx: ExtensionContext): void {
    const state = stateFor(ctx);
    ctx.ui.setStatus("ste", state.enabled ?
      `${state.strict ? "◆" : "○"} STE ${state.mode === "authored" ? "AUTH" : "OPS"}` : undefined);
  }
  pi.on("session_start", (_event, ctx) => { start(ctx); });
  pi.on("session_switch", (_event, ctx) => { start(ctx); });
  pi.on("session_branch", (_event, ctx) => { start(ctx); });
  pi.on("session_tree", (_event, ctx) => {
    const state = stateFor(ctx);
    state.pending = [];
    state.warnings.clear();
    state.notes = 0;
  });
  pi.on("session_shutdown", (_event, ctx) => {
    states.clear();
    ctx.ui.setStatus("ste", undefined);
  });

  pi.on("before_agent_start", (event, ctx) => {
    const state = stateFor(ctx);
    if (!state.enabled) return;
    let language = promptText(state.engine);
    const notes: string[] = [];
    if (state.mode === "authored") {
      language = language.replace(
        "Write every reply, comment, document, UI string and commit message in\nSimplified Technical English.",
        "Write operational replies, instructions, comments, UI strings and commit messages in Simplified Technical English.\n" +
        "Apply these rules to documents except the selected authored document.\n" +
        "The selected authored document and say calls with authored=true use the requested writing voice instead.",
      );
      notes.push(
        "## Task mode: authored",
        "Use authored prose only for the writing task that the user requested.",
        "Send authored output through say with authored=true. Keep routine chat, status, and instructions in STE.",
        state.authoredPath ? `Selected authored document: ${JSON.stringify(state.authoredPath)}.` :
          "No authored document is selected. All file checks remain active.",
        "Code comments and commit messages keep STE checks. ste_lint still checks any text that you submit.",
        "Do not change safety rules or independent host instructions. Return to operational mode after the authored task.",
      );
    }
    return { systemPrompt: [...event.systemPrompt, language, ...notes, ...(state.strict ? [STRICT_NOTE] : [])] };
  });

  pi.on("tool_call", (event, ctx) => {
    const state = stateFor(ctx);
    if (!state.enabled) return;
    const input = event.input as Record<string, unknown>;
    if (event.toolName === "say" && input.authored === true) {
      if (state.mode === "authored") return;
      return { block: true, reason: "Only authored mode accepts authored output." };
    }
    const targets = subjectsOf(event.toolName, input).filter(target =>
      !(state.mode === "authored" && state.authoredPath &&
        (event.toolName === "write" || event.toolName === "edit") &&
        !target.label.includes("://") &&
        resolve(ctx.cwd, target.label.startsWith("~/") ? resolve(homedir(), target.label.slice(2)) : target.label) === state.authoredPath));
    if (targets.length === 0) return;
    const results = targets.map(target => ({ target, result: check(state.engine, target) }));
    report(ctx, results.flatMap(({ result }) => result.violations));
    const reasons = results.flatMap(({ result }) => result.reason === undefined ? [] : [result.reason]);
    if (reasons.length) return { block: true, reason: reasons.join("\n\n") };
    const warnings = results.filter(({ result }) => result.soft.length > 0)
      .map(({ target, result }) => warnReason(target.label, result.soft));
    if (warnings.length) {
      const warning = warnings.join("\n\n");
      state.warnings.set(event.toolCallId, warning);
      ctx.ui.notify(warning, "warning");
    }
  });
  pi.on("tool_result", (event, ctx) => {
    const state = stateFor(ctx);
    const warning = state.warnings.get(event.toolCallId);
    if (warning === undefined) return;
    state.warnings.delete(event.toolCallId);
    return { content: [...event.content, { type: "text" as const, text: warning }] };
  });

  pi.on("message_end", (event, ctx) => {
    const state = stateFor(ctx);
    if (!state.enabled || event.message.role !== "assistant") return;
    const parts = event.message.content;
    const subject = replySubject(parts.filter(part => part.type === "text").map(part => part.text).join("\n"));
    if (subject) {
      const violations = replyFaults(state.engine, subject);
      report(ctx, violations);
      state.pending.push(...violations);
    }
    if (parts.some(part => part.type === "toolCall")) flush(state, "steer");
  });
  // omp's terminal agent_end is pi's agent_settled. Non-terminal ends must not
  // reset the feedback cap or queue a note for an unrelated user turn.
  pi.on("agent_end", (event, ctx) => {
    const state = stateFor(ctx);
    if (!state.enabled || event.willContinue) return;
    flush(state, "nextTurn");
    state.notes = 0;
    state.warnings.clear();
  });
}
