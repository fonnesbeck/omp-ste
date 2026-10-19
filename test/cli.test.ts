import { expect, test } from "bun:test";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

test("the package CLI enforces writes from the project cwd even after --", async () => {
  const directory = await mkdtemp(join(tmpdir(), "omp-ste-cli-"));
  const denied = join(directory, "denied.md");
  const provider = join(directory, "provider.mjs");
  await writeFile(join(directory, ".simple-english.json"), JSON.stringify({ rules: { semicolon: "hard" } }));
  await writeFile(provider, `
import { createMockModel } from ${JSON.stringify(import.meta.resolve("@oh-my-pi/pi-ai/providers/mock"))};
export default function fixture(pi) {
  const mock = createMockModel({ id: "cli-regression", provider: "ste-cli-test", responses: [
    { content: [{ type: "toolCall", id: "denied", name: "write", arguments: { path: ${JSON.stringify(denied)}, content: "Open the valve; close the cover." } }] },
    { content: ["Open the valve."] },
  ] });
  pi.registerProvider("ste-cli-test", {
    api: "mock", baseUrl: "mock://local", apiKey: "fixture-only", streamSimple: mock.stream,
    models: [{ id: "cli-regression", name: "Local CLI test", reasoning: false, input: ["text"], cost: mock.model.cost, contextWindow: 200000, maxTokens: 4096 }],
  });
}
`);
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: directory, XDG_CONFIG_HOME: join(directory, "config"),
    XDG_DATA_HOME: join(directory, "data"), PI_CODING_AGENT_DIR: join(directory, "agent") };
  delete env.SIMPLE_ENGLISH_DICTIONARY;
  try {
    const child = Bun.spawn([process.execPath, fileURLToPath(new URL("../src/cli.ts", import.meta.url)),
      "--no-extensions", "--extension", provider, "--model", "ste-cli-test/cli-regression",
      "--mode", "json", "--no-session", "--no-skills", "--no-rules", "--no-title", "--no-lsp",
      "--auto-approve", "-p", "--", "Write the document."], {
      cwd: directory, env, stdin: "ignore", stdout: "pipe", stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
    ]);
    expect({ exitCode, stderr }).toMatchObject({ exitCode: 0 });
    expect(stdout).toContain("[semicolon]");
    await expect(access(denied)).rejects.toMatchObject({ code: "ENOENT" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);
