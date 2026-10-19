import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import {
  check, format, lint, loadConfig, newEngine, promptText, replyFaults,
  replySubject, ruleNames, summarise, warnReason,
  type Config, type Engine, type Violation,
} from "./engine.ts";
import { subjectsOf } from "./subjects.ts";

const STRICT_NOTE = [
  "## Simplified Technical English: strict mode",
  "Send every user-facing reply through the `say` tool.",
  "Write no prose outside that tool.",
  "A hard violation blocks the call. Read the reason, rewrite the text, then call the tool again.",
].join("\n");
const NOTE_CAP = 3;
const COMMANDS = ["on", "off", "status", "strict", "strict on", "strict off"];

interface State {
  engine: Engine;
  fault?: string;
  enabled: boolean;
  strict: boolean;
  pending: Violation[];
  notes: number;
  warnings: Map<string, string>;
}

/** A port of agent-ste's pi extension, using only stock omp extension hooks. */
export default function steExtension(pi: ExtensionAPI): void {
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
      state = { engine: newEngine(config), fault, enabled: true, strict: false,
        pending: [], notes: 0, warnings: new Map() };
      states.set(id, state);
    }
    return state;
  }

  function report(ctx: ExtensionContext, violations: Violation[]): void {
    const { hard, soft } = summarise(violations);
    ctx.ui.setStatus("ste", hard + soft === 0 ? "STE: clean" : `STE: ${hard} hard / ${soft} soft`);
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
    description: "Toggle STE checks. Use strict to require replies through say, or status to show settings.",
    getArgumentCompletions: (prefix) => {
      const matches = COMMANDS.filter(value => value.startsWith(prefix)).map(value => ({ value, label: value }));
      return matches.length === 0 ? null : matches;
    },
    handler: async (args, ctx) => {
      const state = stateFor(ctx);
      const word = args.trim().toLowerCase();
      if (word === "status") {
        const mode = !state.enabled ? "disabled" : state.strict ? "strict" : "enabled";
        const overrides = Object.entries(state.engine.rules).map(([name, severity]) => `${name}: ${severity}`);
        ctx.ui.notify([`STE ${mode}`, ...(state.fault ? [`Config error: ${state.fault}. Using built-in severities.`] : []),
          ...(overrides.length ? overrides : ["Built-in rule severities."])].join("\n"), "info");
        return;
      }
      if (word === "strict" || word === "strict on") {
        state.enabled = true;
        state.strict = true;
      } else if (word === "strict off") {
        state.strict = false;
      } else if (word === "" || word === "on" || word === "off") {
        state.enabled = word === "" ? !state.enabled : word === "on";
        if (!state.enabled) {
          state.strict = false;
          state.pending = [];
          state.warnings.clear();
          state.notes = 0;
        }
      } else {
        ctx.ui.notify("Usage: /ste [on|off|status|strict|strict on|strict off]", "warning");
        return;
      }
      ctx.ui.setStatus("ste", state.enabled ? `STE: ${state.strict ? "strict" : "enabled"}` : undefined);
      ctx.ui.notify(!state.enabled ? "STE disabled" : state.strict
        ? "STE strict: send every reply through say. Direct replies are not blocked by omp."
        : "STE enabled", "info");
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
  pi.registerTool({
    name: "say",
    label: "Say",
    description: "Send prose to the user. In STE strict mode, use this for every reply. A hard STE violation blocks the call.",
    parameters,
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
    ctx.ui.setStatus("ste", state.enabled ? `STE: ${state.strict ? "strict" : "enabled"}` : undefined);
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
    return { systemPrompt: [...event.systemPrompt, promptText(state.engine), ...(state.strict ? [STRICT_NOTE] : [])] };
  });

  pi.on("tool_call", (event, ctx) => {
    const state = stateFor(ctx);
    if (!state.enabled) return;
    const targets = subjectsOf(event.toolName, event.input as Record<string, unknown>);
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
