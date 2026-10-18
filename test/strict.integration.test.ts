import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthStorage, createAgentSession, SessionManager, Settings } from "@oh-my-pi/pi-coding-agent";
import { initializeExtensions } from "@oh-my-pi/pi-coding-agent/modes/runtime-init";
import { createMockModel } from "@oh-my-pi/pi-ai/providers/mock";
import ste from "../src/index.ts";

test("strict replies stay hidden until approval and then settle without another model call", async () => {
  const directory = await mkdtemp(join(tmpdir(), "omp-ste-strict-"));
  const oldXdg = process.env.XDG_CONFIG_HOME;
  const oldDictionary = process.env.SIMPLE_ENGLISH_DICTIONARY;
  process.env.XDG_CONFIG_HOME = join(directory, "config");
  delete process.env.SIMPLE_ENGLISH_DICTIONARY;
  const authStorage = await AuthStorage.create(join(directory, "auth.db"));
  const mock = createMockModel({ responses: [
    { content: ["PRIVATE_PROSE", { type: "toolCall", id: "denied", name: "say", arguments: { text: "PRIVATE_PROPOSAL; close the cover." } }] },
    { content: [{ type: "toolCall", id: "approved", name: "say", arguments: { text: "Open the valve." } }] },
  ] });
  authStorage.keys.setRuntime(mock.model.provider, "local-test-only");
  const { session } = await createAgentSession({
    cwd: directory, agentDir: join(directory, "agent"), model: mock.model, authStorage,
    sessionManager: SessionManager.inMemory(directory), settings: Settings.isolated(),
    extensions: [ste], disableExtensionDiscovery: true, preloadedCustomToolPaths: [],
    enableMCP: false, enableLsp: false, enableIrc: false, skipPythonPreflight: true,
    skills: [], rules: [], contextFiles: [], promptTemplates: [], slashCommands: [],
    toolNames: [], autoApprove: true, systemPrompt: "Use say for your reply.", bindProcessState: false,
  });
  try {
    await initializeExtensions(session, {
      reportSendError: (_action, error) => { throw error; },
      reportRuntimeError: (error) => { throw new Error(error.error); },
    });
    session.agent.streamFn = mock.stream;
    const displayed: string[] = [];
    session.subscribe((event) => displayed.push(JSON.stringify(event)));
    await session.prompt("/ste strict");
    await session.prompt("Send the reply.");
    expect(mock.calls).toHaveLength(2);
    expect(JSON.stringify(mock.calls[1]?.context.messages)).toContain("[semicolon]");
    expect(displayed.join("\n")).not.toContain("PRIVATE_");
    expect(displayed.join("\n")).toContain("Open the valve.");
    expect(session.getLastAssistantMessage()?.stopReason).not.toBe("error");
  } finally {
    await session.dispose();
    authStorage.close();
    if (oldXdg === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = oldXdg;
    if (oldDictionary === undefined) delete process.env.SIMPLE_ENGLISH_DICTIONARY;
    else process.env.SIMPLE_ENGLISH_DICTIONARY = oldDictionary;
    await rm(directory, { recursive: true, force: true });
  }
});
