import type { AgentSessionEvent, MessageStartEvent } from "@oh-my-pi/pi-coding-agent";

export interface OutputState {
  enabled: boolean;
  strict: boolean;
  readonly approvedSayReplies: Map<string, string>;
}

type DisplayMessage = MessageStartEvent["message"];
type AssistantMessage = Extract<DisplayMessage, { role: "assistant" }>;
type DisplayToolCall = Extract<AssistantMessage["content"][number], { type: "toolCall" }>;

interface SayDisplayResult {
  content: { type: "text"; text: string }[];
  details: { steApproved: boolean; displayAsReply: boolean };
  isError: boolean;
}

const REDACTED_ARGUMENTS = { text: "[reply pending writing-rule approval]" };

function sanitizeToolCall(call: DisplayToolCall): void {
  if (call.name !== "say") return;
  call.arguments = { ...REDACTED_ARGUMENTS };
  delete call.rawBlock;
  delete call.intent;
}

function sayResult(state: OutputState, id: string): SayDisplayResult {
  const approved = state.approvedSayReplies.get(id);
  return {
    content: approved === undefined ? [] : [{ type: "text", text: approved }],
    details: { steApproved: approved !== undefined, displayAsReply: approved !== undefined },
    isError: approved === undefined,
  };
}

function sanitizeMessage(state: OutputState, message: DisplayMessage): void {
  if (message.role === "assistant") {
    message.content = message.content.filter((block) => {
      if (block.type === "text" || block.type === "thinking") return false;
      if (block.type === "toolCall") sanitizeToolCall(block);
      return true;
    });
    // Provider failures can quote a raw proposal, too.
    delete message.errorMessage;
    delete message.providerPayload;
  } else if (message.role === "toolResult" && message.toolName === "say") {
    Object.assign(message, sayResult(state, message.toolCallId));
  }
}

/** Projects the detached event supplied by the host; never receives live execution objects. */
export function filterOutput(state: OutputState, event: AgentSessionEvent): AgentSessionEvent | undefined {
  if (!state.enabled || !state.strict) return event;
  if (event.type === "tool_stream_update" && event.toolName === "say") return undefined;

  const filtered = event;
  if (filtered.type === "message_start" || filtered.type === "message_update" || filtered.type === "message_end" || filtered.type === "turn_end") {
    sanitizeMessage(state, filtered.message);
  }
  if (filtered.type === "message_update") {
    const update = filtered.assistantMessageEvent;
    if ("partial" in update) sanitizeMessage(state, update.partial);
    if (update.type === "done") sanitizeMessage(state, update.message);
    if (update.type === "error") sanitizeMessage(state, update.error);
    if (update.type === "text_delta" || update.type === "thinking_delta" || update.type === "toolcall_delta") {
      update.delta = "";
    }
    if (update.type === "text_end" || update.type === "thinking_end") update.content = "";
    if (update.type === "toolcall_end") sanitizeToolCall(update.toolCall);
  }
  if ((filtered.type === "tool_execution_start" || filtered.type === "tool_execution_update") && filtered.toolName === "say") {
    filtered.args = { ...REDACTED_ARGUMENTS };
    if (filtered.type === "tool_execution_start") delete filtered.intent;
    else filtered.partialResult = sayResult(state, filtered.toolCallId);
  }
  if (filtered.type === "tool_execution_end" && filtered.toolName === "say") {
    filtered.result = sayResult(state, filtered.toolCallId);
    filtered.isError = !state.approvedSayReplies.has(filtered.toolCallId);
  }
  if (filtered.type === "turn_end") {
    for (const message of filtered.toolResults) sanitizeMessage(state, message);
  }
  if (filtered.type === "agent_end") {
    for (const message of filtered.messages) sanitizeMessage(state, message);
  }
  return filtered;
}
