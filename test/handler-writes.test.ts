import { expect, spyOn, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthStorage, createAgentSession, SessionManager, Settings, type AgentSession } from "@oh-my-pi/pi-coding-agent";
import { initializeExtensions } from "@oh-my-pi/pi-coding-agent/modes/runtime-init";
import * as fileTransfer from "@oh-my-pi/pi-coding-agent/ssh/file-transfer";
import { createMockModel, type MockResponse } from "@oh-my-pi/pi-ai/providers/mock";
import ste from "../src/index.ts";

async function withSession(
  responses: MockResponse[],
  exercise: (session: AgentSession, directory: string) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "omp-ste-handlers-"));
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
    extensions: [ste], disableExtensionDiscovery: true, preloadedCustomToolPaths: [],
    enableMCP: false, enableLsp: false, enableIrc: false, skipPythonPreflight: true,
    skills: [], rules: [], contextFiles: [], promptTemplates: [], slashCommands: [],
    toolNames: ["read", "write"], autoApprove: true, bindProcessState: false,
  });
  try {
    await initializeExtensions(session, {
      reportSendError: (_action, error) => { throw error; },
      reportRuntimeError: (error) => { throw new Error(error.error); },
    });
    session.agent.streamFn = mock.stream;
    await exercise(session, directory);
  } finally {
    await session.dispose();
    authStorage.close();
    if (oldXdg === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = oldXdg;
    if (oldDictionary === undefined) delete process.env.SIMPLE_ENGLISH_DICTIONARY;
    else process.env.SIMPLE_ENGLISH_DICTIONARY = oldDictionary;
    await rm(directory, { recursive: true, force: true });
  }
}

function result(session: AgentSession, toolCallId: string) {
  const message = session.messages.find((entry) => entry.role === "toolResult" && entry.toolCallId === toolCallId);
  if (message?.role !== "toolResult") throw new Error(`Missing result for ${toolCallId}`);
  return message;
}

function call(id: string, name: string, args: Record<string, unknown>): MockResponse[] {
  return [{ content: [{ type: "toolCall", id, name, arguments: args }] }, { content: ["Done."] }];
}

const firstConflict = "<<<<<<< ours\nOpen the valve.\n=======\nClose the valve.\n>>>>>>> theirs";
const secondConflict = "<<<<<<< ours\nOpen the cover.\n=======\nClose the cover.\n>>>>>>> theirs";
const thirdConflict = "<<<<<<< ours\nInstall the bolt.\n=======\nRemove the bolt.\n>>>>>>> theirs";

test("native conflict writes gate reconstructed files and retain unrelated old violations", async () => {
  await withSession([
    ...call("read-conflicts", "read", { path: "procedure.md" }),
    ...call("denied-single", "write", { path: "conflict://1", content: "Open the valve; close the cover." }),
    ...call("clean-single", "write", { path: "conflict://1", content: "Open the valve." }),
    ...call("denied-bulk", "write", { path: "conflict://*", content: "Open the cover; close the valve." }),
    ...call("clean-bulk", "write", { path: "conflict://*", content: "@ours" }),
  ], async (session, directory) => {
    const path = join(directory, "procedure.md");
    const oldNote = "Old text; keep this text.\n\n";
    const original = `${oldNote}${firstConflict}\n\n${secondConflict}\n\n${thirdConflict}\n`;
    await writeFile(path, original);
    await session.prompt("Read the procedure.");
    expect(result(session, "read-conflicts").isError).toBe(false);

    await session.prompt("Resolve the first conflict.");
    expect(result(session, "denied-single").isError).toBe(true);
    expect(JSON.stringify(result(session, "denied-single").content)).toContain("[semicolon]");
    expect(await readFile(path, "utf8")).toBe(original);

    await session.prompt("Retry the first resolution.");
    const afterSingle = `${oldNote}Open the valve.\n\n${secondConflict}\n\n${thirdConflict}\n`;
    expect(result(session, "clean-single").isError).toBe(false);
    expect(await readFile(path, "utf8")).toBe(afterSingle);

    await session.prompt("Resolve the remaining conflicts.");
    expect(result(session, "denied-bulk").isError).toBe(true);
    expect(JSON.stringify(result(session, "denied-bulk").content)).toContain("[semicolon]");
    expect(await readFile(path, "utf8")).toBe(afterSingle);

    await session.prompt("Keep the ours side.");
    expect(result(session, "clean-bulk").isError).toBe(false);
    expect(await readFile(path, "utf8")).toBe(`${oldNote}Open the valve.\n\nOpen the cover.\n\nInstall the bolt.\n`);
  });
});

test("native SSH writes gate decoded remote file text before persistence", async () => {
  const invalid = "// Open the valve; close the cover.\n";
  const valid = 'const text = "Open the valve; close the cover.";\n';
  await withSession([
    ...call("denied-ssh", "write", { path: "ssh://ste-test.invalid/tmp/procedure.%74%73", content: invalid }),
    ...call("clean-ssh", "write", { path: "ssh://ste-test.invalid/tmp/procedure.%74%73", content: valid }),
  ], async (session, directory) => {
    const destination = join(directory, "remote.ts");
    await writeFile(destination, "original\n");
    const persistence = spyOn(fileTransfer, "writeRemoteFile").mockImplementation(async (target, remotePath, bytes) => {
      await writeFile(destination, bytes);
    });
    try {
      await session.prompt("Write the remote source file.");
      expect(result(session, "denied-ssh").isError).toBe(true);
      expect(JSON.stringify(result(session, "denied-ssh").content)).toContain("[semicolon]");
      expect(await readFile(destination, "utf8")).toBe("original\n");

      await session.prompt("Retry the remote write.");
      expect(result(session, "clean-ssh").isError).toBe(false);
      expect(await readFile(destination, "utf8")).toBe(valid);
    } finally {
      persistence.mockRestore();
    }
  });
});
