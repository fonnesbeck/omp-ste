import { expect, spyOn, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AuthStorage, createAgentSession, SessionManager, Settings,
  type AgentSession, type ExtensionAPI, type ExtensionFactory,
} from "@oh-my-pi/pi-coding-agent";
import { createMockModel, type MockResponse } from "@oh-my-pi/pi-ai/providers/mock";
import { runPrintMode } from "@oh-my-pi/pi-coding-agent/modes/print-mode";
import { initializeExtensions } from "@oh-my-pi/pi-coding-agent/modes/runtime-init";
import type { SessionTreeNode } from "@oh-my-pi/pi-coding-agent/session/session-entries";
import ste from "../src/index.ts";

async function fixture(responses: MockResponse[], extensions: ExtensionFactory[] = []) {
  const directory = await mkdtemp(join(tmpdir(), "omp-ste-display-"));
  const oldXdg = process.env.XDG_CONFIG_HOME;
  const oldDictionary = process.env.SIMPLE_ENGLISH_DICTIONARY;
  process.env.XDG_CONFIG_HOME = join(directory, "config");
  delete process.env.SIMPLE_ENGLISH_DICTIONARY;
  const authStorage = await AuthStorage.create(join(directory, "auth.db"));
  const mock = createMockModel({ responses });
  authStorage.keys.setRuntime(mock.model.provider, "local-test-only");
  const { session } = await createAgentSession({
    cwd: directory, agentDir: join(directory, "agent"), model: mock.model, authStorage,
    sessionManager: SessionManager.inMemory(directory), settings: Settings.isolated(),
    extensions, disableExtensionDiscovery: true, preloadedCustomToolPaths: [],
    enableMCP: false, enableLsp: false, enableIrc: false, skipPythonPreflight: true,
    skills: [], rules: [], contextFiles: [], promptTemplates: [], slashCommands: [],
    toolNames: [], autoApprove: true, systemPrompt: "Use the supplied tools.", bindProcessState: false,
  });
  session.agent.streamFn = mock.stream;
  return {
    session, mock,
    async close() {
      await session.dispose();
      authStorage.close();
      if (oldXdg === undefined) delete process.env.XDG_CONFIG_HOME;
      else process.env.XDG_CONFIG_HOME = oldXdg;
      if (oldDictionary === undefined) delete process.env.SIMPLE_ENGLISH_DICTIONARY;
      else process.env.SIMPLE_ENGLISH_DICTIONARY = oldDictionary;
      await rm(directory, { recursive: true, force: true });
    },
  };
}

async function initialize(session: AgentSession) {
  await initializeExtensions(session, {
    reportSendError: (_action, error) => { throw error; },
    reportRuntimeError: (error) => { throw new Error(error.error); },
  });
}

function topology(tree: SessionTreeNode[]): unknown[] {
  return tree.map(({ entry, label, children }) => ({
    id: entry.id, parentId: entry.parentId, label, children: topology(children),
  }));
}

function registerReply(pi: ExtensionAPI) {
  pi.registerTool({
    name: "reply", label: "Reply", description: "Deliver the approved reply.",
    parameters: pi.zod.object({}), approval: "read", loadMode: "essential",
    execute: async () => ({
      content: [{ type: "text" as const, text: "Open the valve." }],
      details: { displayAsReply: true, terminateTurn: true },
    }),
  });
}

test("tree display filters every branch without changing stored proposals or navigation IDs", async () => {
  const f = await fixture([
    { content: ["PRIVATE_PROSE", { type: "toolCall", id: "denied", name: "say", arguments: { text: "PRIVATE_PROPOSAL; close the cover." } }] },
    { content: [{ type: "toolCall", id: "approved", name: "say", arguments: { text: "Open the valve." } }] },
  ], [ste]);
  try {
    await initialize(f.session);
    await f.session.prompt("/ste strict");
    await f.session.prompt("Send the reply.");
    const manager = f.session.sessionManager;
    const firstMessage = manager.getEntries().find(entry => entry.type === "message");
    expect(firstMessage).toBeDefined();
    manager.branch(firstMessage!.id);
    manager.appendMessage({ role: "user", content: "Alternate branch", timestamp: Date.now() });
    const rawTree = manager.getTree();
    const original = JSON.stringify(rawTree);
    const display = f.session.getDisplayTree();
    expect(original).toContain("PRIVATE_PROPOSAL");
    expect(JSON.stringify(display)).not.toContain("PRIVATE_");
    expect(topology(display)).toEqual(topology(rawTree));
    display[0]!.entry.timestamp = "display-only mutation";
    expect(JSON.stringify(manager.getTree())).toBe(original);
    expect(f.mock.calls).toHaveLength(2);
  } finally { await f.close(); }
});

test("a fully suppressed tree message retains a navigable, detached node", async () => {
  const f = await fixture([], [(pi) => {
    pi.registerOutputFilter(event => event.type === "message_end" ? undefined : event);
  }]);
  try {
    await initialize(f.session);
    const manager = f.session.sessionManager;
    manager.appendMessage({ role: "user", content: "PRIVATE_MESSAGE", timestamp: Date.now() });
    const raw = manager.getTree();
    const display = f.session.getDisplayTree();
    expect(topology(display)).toEqual(topology(raw));
    expect(JSON.stringify(display)).not.toContain("PRIVATE_MESSAGE");
    expect(JSON.stringify(raw)).toContain("PRIVATE_MESSAGE");
    expect(display[0]!.entry).not.toBe(raw[0]!.entry);
  } finally { await f.close(); }
});


for (const isError of [false, true]) {
  test(`direct external terminal reply ${isError ? "errors continue" : "settles before another model call"}`, async () => {
    let session: AgentSession;
    const f = await fixture([
      { content: [{ type: "toolCall", id: "bridge", name: "direct_reply", arguments: {} }] },
      { content: ["Continued after failed delivery."] },
    ], [(pi) => {
      pi.registerTool({
        name: "direct_reply", label: "Direct reply", description: "Exercise externally dispatched completion.",
        parameters: pi.zod.object({}), approval: "read", loadMode: "essential",
        execute: async () => {
          // Cursor invokes the same external-event entry point instead of afterToolCall.
          session.agent.emitExternalEvent({
            type: "tool_execution_end", toolCallId: "cursor-reply", toolName: "reply", isError,
            result: { content: [{ type: "text", text: "Open the valve." }], details: { terminateTurn: true } },
          });
          return { content: [{ type: "text" as const, text: "Bridge completed" }], details: {} };
        },
      });
    }]);
    session = f.session;
    try {
      await initialize(session);
      await session.prompt("Send the reply.");
      expect(f.mock.calls).toHaveLength(isError ? 2 : 1);
    } finally { await f.close(); }
  });
}


test("print mode delivers an explicit terminal tool reply without output filters", async () => {
  const f = await fixture([
    { content: ["Model preamble is not the approved reply.", { type: "toolCall", id: "reply", name: "reply", arguments: {} }] },
  ], [registerReply]);
  const { output, stdout } = captureStdout();
  try {
    expect(await runPrintMode(f.session, { mode: "text", initialMessage: "Send the reply." })).toBe(0);
    expect(output.join("")).toBe("Open the valve.\n");
    expect(f.mock.calls).toHaveLength(1);
  } finally { stdout.mockRestore(); await f.close(); }
});

function captureStdout() {
  const output: string[] = [];
  const stdout = spyOn(process.stdout, "write").mockImplementation((
    chunk: string | Uint8Array,
    encodingOrCallback?: BufferEncoding | ((error?: Error | null) => void),
    callback?: (error?: Error | null) => void,
  ) => {
    output.push(String(chunk));
    const done = typeof encodingOrCallback === "function" ? encodingOrCallback : callback;
    done?.();
    return true;
  });
  return { output, stdout };
}

test("print mode preserves ordinary unfiltered assistant replies", async () => {
  const f = await fixture([{ content: ["Ordinary assistant reply."] }]);
  const { output, stdout } = captureStdout();
  try {
    expect(await runPrintMode(f.session, { mode: "text", initialMessage: "Reply normally." })).toBe(0);
    expect(output.join("")).toBe("Ordinary assistant reply.\n");
  } finally { stdout.mockRestore(); await f.close(); }
});

test("print rejection clears an older approved tool reply without falling back to private model prose", async () => {
  const f = await fixture([
    { content: [{ type: "toolCall", id: "approved", name: "reply_attempt", arguments: { accepted: true } }] },
    { content: [{ type: "toolCall", id: "rejected", name: "reply_attempt", arguments: { accepted: false } }] },
    { content: ["PRIVATE_MODEL_PROSE"] },
  ], [(pi) => {
    pi.registerOutputFilter(event => {
      if (event.type === "message_end" && event.message.role === "assistant") event.message.content = [];
      return event;
    });
    const parameters = pi.zod.object({ accepted: pi.zod.boolean() });
    pi.registerTool<typeof parameters>({
      name: "reply_attempt", label: "Reply attempt", description: "Attempt delivery.",
      parameters, approval: "read", loadMode: "essential",
      execute: async (_id, params) => ({
        content: [{ type: "text" as const, text: params.accepted ? "Older approved reply." : "Rejected reply." }],
        details: { displayAsReply: params.accepted },
        isError: !params.accepted,
      }),
    });
  }]);
  const { output, stdout } = captureStdout();
  try {
    expect(await runPrintMode(f.session, { mode: "text", initialMessage: "Try delivery." })).toBe(0);
    expect(f.mock.calls).toHaveLength(3);
    expect(output.join("")).toBe("");
  } finally { stdout.mockRestore(); await f.close(); }
});
