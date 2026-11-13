import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthStorage, createAgentSession, SessionManager, Settings, ToolExecutionComponent } from "@oh-my-pi/pi-coding-agent";
import { initializeExtensions } from "@oh-my-pi/pi-coding-agent/modes/runtime-init";
import { createMockModel } from "@oh-my-pi/pi-ai/providers/mock";
import ste from "../src/index.ts";

test.each(["operational", "authored"])("operational replies keep feedback in %s mode without showing lint or feedback in the console", async mode => {
  const directory = await mkdtemp(join(tmpdir(), "omp-ste-reply-"));
  const previous = { XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME, STE_CONFIG: process.env.STE_CONFIG };
  process.env.XDG_CONFIG_HOME = join(directory, "config");
  delete process.env.STE_CONFIG;
  await writeFile(join(directory, ".ste.json"), "{}");
  const auth = await AuthStorage.create(join(directory, "auth.db"));
  const firstReply = "The robust tool works; open the file.";
  const model = createMockModel({
    responses: [
      { content: [{ type: "toolCall", id: "lint", name: "ste_lint", arguments: { text: firstReply } }] },
      { content: [firstReply] },
      { content: ["Open the file."] },
    ],
  });
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
    await session.prompt(`/ste mode ${mode}`);
    await session.prompt("Explain the tool.");
    const lintResult = session.messages.find(message => message.role === "toolResult" && message.toolCallId === "lint");
    expect(lintResult?.role).toBe("toolResult");
    if (lintResult?.role !== "toolResult") throw new Error("Missing ste_lint result");
    expect(JSON.stringify(lintResult.content)).toContain("[style/semicolon]");
    const card = new ToolExecutionComponent(
      "ste_lint",
      { text: firstReply },
      {},
      session.getToolByName("ste_lint"),
      { requestRender() {}, requestComponentRender() {}, resetDisplay() {} },
      directory,
      "lint",
    );
    expect(card.render(80)).toEqual([]);
    card.updateResult(lintResult, false, "lint");
    expect(card.render(80)).toEqual([]);
    const reply = session.messages.findLast(message => message.role === "assistant");
    expect(reply?.content).toEqual([{ type: "text", text: firstReply }]);
    expect(model.calls).toHaveLength(2);
    await session.prompt("Write the next reply.");
    const feedback = session.messages.find(message => message.role === "custom" && message.customType === "ste-violation");
    expect(feedback).toMatchObject({ role: "custom", customType: "ste-violation", display: false });
    const context = JSON.stringify(model.calls[2]!.context.messages);
    expect(context).toContain("[style/semicolon]");
    expect(context).toContain("[style/marketing]");
    expect(model.calls).toHaveLength(3);
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
