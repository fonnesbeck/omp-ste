import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthStorage, createAgentSession, SessionManager, Settings } from "@oh-my-pi/pi-coding-agent";
import { initializeExtensions } from "@oh-my-pi/pi-coding-agent/modes/runtime-init";
import { createMockModel } from "@oh-my-pi/pi-ai/providers/mock";
import ste from "../src/index.ts";

test("normal replies stay intact and hard and soft feedback reaches the next prompt without an extra turn", async () => {
  const directory = await mkdtemp(join(tmpdir(), "omp-ste-reply-"));
  const previous = { XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME, STE_CONFIG: process.env.STE_CONFIG };
  process.env.XDG_CONFIG_HOME = join(directory, "config");
  delete process.env.STE_CONFIG;
  await writeFile(join(directory, ".ste.json"), "{}");
  const auth = await AuthStorage.create(join(directory, "auth.db"));
  const firstReply = "The robust tool works; open the file.";
  const model = createMockModel({ responses: [{ content: [firstReply] }, { content: ["Open the file."] }] });
  auth.keys.setRuntime(model.provider, "local-test-only");
  const { session } = await createAgentSession({
    cwd: directory, agentDir: join(directory, "agent"), model, authStorage: auth,
    sessionManager: SessionManager.inMemory(directory), settings: Settings.isolated(),
    extensions: [ste], disableExtensionDiscovery: true, preloadedCustomToolPaths: [],
    enableMCP: false, enableLsp: false, enableIrc: false, skipPythonPreflight: true,
    skills: [], rules: [], contextFiles: [], promptTemplates: [], slashCommands: [],
    toolNames: [], autoApprove: true, bindProcessState: false,
  });
  try {
    await initializeExtensions(session, {
      reportSendError: (_action, error) => { throw error; },
      reportRuntimeError: error => { throw new Error(error.error); },
    });
    session.agent.streamFn = model.stream;
    await session.prompt("Explain the tool.");
    const reply = session.messages.find(message => message.role === "assistant");
    expect(reply?.content).toEqual([{ type: "text", text: firstReply }]);
    expect(model.calls).toHaveLength(1);
    await session.prompt("Write the next reply.");
    const context = JSON.stringify(model.calls[1]!.context.messages);
    expect(context).toContain("[style/semicolon]");
    expect(context).toContain("[style/marketing]");
    expect(model.calls).toHaveLength(2);
  } finally {
    await session.dispose();
    auth.close();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(directory, { recursive: true, force: true });
  }
});
