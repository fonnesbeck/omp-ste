import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthStorage, createAgentSession, SessionManager, Settings, type AgentSession } from "@oh-my-pi/pi-coding-agent";
import { initializeExtensions } from "@oh-my-pi/pi-coding-agent/modes/runtime-init";
import { createMockModel, type MockHandler, type MockResponse } from "@oh-my-pi/pi-ai/providers/mock";
import ste from "../src/index.ts";

async function withSession(
  responses: MockHandler[],
  exercise: (session: AgentSession, directory: string) => Promise<void>,
  rules: Record<string, string> = {},
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "omp-ste-stock-"));
  const previous = { XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME, STE_CONFIG: process.env.STE_CONFIG };
  process.env.XDG_CONFIG_HOME = join(directory, "config");
  delete process.env.STE_CONFIG;
  await writeFile(join(directory, ".ste.json"), JSON.stringify({ rules }));
  const authStorage = await AuthStorage.create(join(directory, "auth.db"));
  const model = createMockModel({ responses });
  authStorage.keys.setRuntime(model.model.provider, "local-test-only");
  let session: AgentSession | undefined;
  try {
    ({ session } = await createAgentSession({
      cwd: directory, agentDir: join(directory, "agent"), model: model.model, authStorage,
      sessionManager: SessionManager.inMemory(directory), settings: Settings.isolated(),
      extensions: [ste], disableExtensionDiscovery: true, preloadedCustomToolPaths: [],
      enableMCP: false, enableLsp: false, enableIrc: false, skipPythonPreflight: true,
      skills: [], rules: [], contextFiles: [], promptTemplates: [], slashCommands: [],
      toolNames: ["read", "write", "edit"], autoApprove: true, bindProcessState: false,
    }));
    await initializeExtensions(session, {
      reportSendError: (_action, error) => { throw error; },
      reportRuntimeError: error => { throw new Error(error.error); },
    });
    session.agent.streamFn = model.stream;
    await exercise(session, directory);
  } finally {
    await session?.dispose();
    authStorage.close();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(directory, { recursive: true, force: true });
  }
}

function result(session: AgentSession, id: string) {
  const message = session.messages.find(entry => entry.role === "toolResult" && entry.toolCallId === id);
  if (message?.role !== "toolResult") throw new Error(`Missing result for ${id}`);
  return message;
}

function call(id: string, name: string, args: Record<string, unknown>): MockResponse[] {
  return [{ content: [{ type: "toolCall", id, name, arguments: args }] }, { content: ["Done."] }];
}

test("stock write blocks prose before mutation, permits code, and reports soft faults without blocking", async () => {
  await withSession([
    ...call("blocked", "write", { path: "notes.md", content: "Open the valve; close the cover." }),
    ...call("code", "write", { path: "code.ts", content: 'const utilize = "Open the valve; close the cover.";\n' }),
    ...call("warned", "write", { path: "notes.md", content: "The robust tool works." }),
  ], async (session, directory) => {
    const path = join(directory, "notes.md");
    await writeFile(path, "Keep this text.\n");
    await session.prompt("Write the notes.");
    expect(result(session, "blocked").isError).toBe(true);
    expect(JSON.stringify(result(session, "blocked").content)).toContain("[style/semicolon]");
    expect(await readFile(path, "utf8")).toBe("Keep this text.\n");
    await session.prompt("Write the code.");
    expect(result(session, "code").isError).toBe(false);
    expect(await readFile(join(directory, "code.ts"), "utf8")).toBe('const utilize = "Open the valve; close the cover.";\n');
    await session.prompt("Write the revised notes.");
    expect(result(session, "warned").isError).toBe(false);
    expect(await readFile(path, "utf8")).toBe("The robust tool works.");
    expect(JSON.stringify(result(session, "warned").content)).toContain("[style/marketing]");
  });
});

test("say blocks hard faults and delivers an approved reply without rewriting it", async () => {
  await withSession([
    ...call("blocked-reply", "say", { text: "Open the valve; close the cover." }),
    ...call("approved-reply", "say", { text: "Open the valve." }),
  ], async session => {
    await session.prompt("Send the reply.");
    expect(result(session, "blocked-reply").isError).toBe(true);
    expect(JSON.stringify(result(session, "blocked-reply").content)).toContain("[style/semicolon]");
    await session.prompt("Send the revised reply.");
    expect(result(session, "approved-reply").isError).toBe(false);
    expect(result(session, "approved-reply").content).toEqual([{ type: "text", text: "Open the valve." }]);
  });
});

test("project severity overrides control the real file gate", async () => {
  await withSession(call("soft", "write", { path: "notes.md", content: "Open the valve; close the cover." }),
    async (session, directory) => {
      await session.prompt("Write the notes.");
      expect(result(session, "soft").isError).toBe(false);
      expect(await readFile(join(directory, "notes.md"), "utf8")).toBe("Open the valve; close the cover.");
      expect(JSON.stringify(result(session, "soft").content)).toContain("[style/semicolon]");
    }, { "style/semicolon": "soft" });
});

test("stock hashline edit is blocked before it changes a file", async () => {
  await withSession([
    { content: [{ type: "toolCall", id: "read", name: "read", arguments: { path: "notes.md" } }] },
    context => {
      const read = context.messages.find(message => message.role === "toolResult" && message.toolCallId === "read");
      const tag = JSON.stringify(read).match(/#([0-9A-F]{4})\]/)?.[1];
      if (!tag) throw new Error("The stock read tool did not return a snapshot tag.");
      return { content: [{ type: "toolCall", id: "edit", name: "edit", arguments: {
        input: `*** Begin Patch\n[notes.md#${tag}]\nPUT 1.=1:\n+Open the valve; close the cover.\n*** End Patch`,
      } }] };
    },
    { content: ["Done."] },
  ], async (session, directory) => {
    const path = join(directory, "notes.md");
    await writeFile(path, "Open the valve.\n");
    await session.prompt("Read and edit the notes.");
    expect(result(session, "edit").isError).toBe(true);
    expect(JSON.stringify(result(session, "edit").content)).toContain("[style/semicolon]");
    expect(await readFile(path, "utf8")).toBe("Open the valve.\n");
  });
});
