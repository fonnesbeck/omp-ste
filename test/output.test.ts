import { expect, test } from "bun:test";
import type { AssistantMessage } from "@oh-my-pi/pi-ai";
import type { AgentSessionEvent } from "@oh-my-pi/pi-coding-agent";
import { filterOutput, type OutputState } from "../src/output.ts";

function state(): OutputState {
  return { enabled: true, strict: true, approvedSayReplies: new Map() };
}

function message(): AssistantMessage {
  return {
    role: "assistant",
    content: [
      { type: "text", text: "PRIVATE_PROSE" },
      { type: "thinking", thinking: "PRIVATE_THINKING" },
      {
        type: "toolCall", id: "reply-1", name: "say",
        arguments: { text: "PRIVATE_PROPOSAL" },
        rawBlock: '<say>{"text":"PRIVATE_RAW_BLOCK"}</say>',
        intent: "PRIVATE_INTENT",
      },
    ],
    api: "openai-responses", provider: "openai", model: "test",
    providerPayload: {
      type: "openaiResponsesHistory", provider: "openai",
      items: [
        { type: "message", role: "assistant", content: [{ type: "output_text", text: "PRIVATE_NATIVE_PROSE" }] },
        { type: "function_call", name: "say", arguments: '{"text":"PRIVATE_NATIVE_PROPOSAL"}' },
      ],
    },
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason: "toolUse", timestamp: 1,
  };
}

test("strict display removes proposals from streaming and terminal frames", () => {
  const original = message();
  const events: AgentSessionEvent[] = [
    { type: "message_start", message: original },
    { type: "message_update", message: original, assistantMessageEvent: { type: "toolcall_delta", contentIndex: 2, delta: "PRIVATE_PROPOSAL", partial: original } },
    { type: "message_update", message: original, assistantMessageEvent: { type: "toolcall_end", contentIndex: 2, toolCall: original.content[2] as Extract<AssistantMessage["content"][number], { type: "toolCall" }>, partial: original } },
    { type: "message_end", message: original },
    { type: "turn_end", message: original, toolResults: [] },
    { type: "agent_end", messages: [original] },
    { type: "tool_execution_start", toolCallId: "reply-1", toolName: "say", args: { text: "PRIVATE_PROPOSAL" }, intent: "PRIVATE_PROPOSAL" },
  ];
  for (const event of events) {
    const filtered = JSON.stringify(filterOutput(state(), structuredClone(event)));
    expect(filtered).not.toContain("PRIVATE_");
  }
});

test("say output remains hidden until approval and is unchanged outside strict mode", () => {
  const current = state();
  const event: AgentSessionEvent = {
    type: "tool_execution_end", toolCallId: "reply-1", toolName: "say",
    result: { content: [{ type: "text", text: "PRIVATE_PROPOSAL" }] }, isError: true,
  };
  expect(JSON.stringify(filterOutput(current, event))).not.toContain("PRIVATE_PROPOSAL");
  current.approvedSayReplies.set("reply-1", "Open the valve.");
  const approved = filterOutput(current, event);
  expect(approved?.type).toBe("tool_execution_end");
  if (approved?.type !== "tool_execution_end") throw new Error("Missing tool result");
  if (typeof approved.result !== "object" || approved.result === null || !("content" in approved.result)) {
    throw new Error("Missing approved reply content");
  }
  expect(approved.result.content).toEqual([{ type: "text", text: "Open the valve." }]);
  expect(approved.isError).toBe(false);
  current.strict = false;
  expect(filterOutput(current, event)).toBe(event);
});
