import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadEngine } from "../src/engine.ts";

let directory: string;
let oldXdg: string | undefined;
let oldAgent: string | undefined;
let oldDictionary: string | undefined;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "omp-ste-config-"));
  oldXdg = process.env.XDG_CONFIG_HOME;
  oldAgent = process.env.PI_CODING_AGENT_DIR;
  oldDictionary = process.env.SIMPLE_ENGLISH_DICTIONARY;
  process.env.XDG_CONFIG_HOME = join(directory, "config");
  process.env.PI_CODING_AGENT_DIR = join(directory, "legacy-agent");
  delete process.env.SIMPLE_ENGLISH_DICTIONARY;
});

afterEach(async () => {
  for (const [key, value] of [
    ["XDG_CONFIG_HOME", oldXdg],
    ["PI_CODING_AGENT_DIR", oldAgent],
    ["SIMPLE_ENGLISH_DICTIONARY", oldDictionary],
  ]) {
    if (value === undefined) delete process.env[key!];
    else process.env[key!] = value;
  }
  await rm(directory, { recursive: true, force: true });
});

test("merges modern configs without reading either legacy pi fallback", async () => {
  const globalDirectory = join(directory, "config", "simple-english");
  const legacyAgent = join(directory, "legacy-agent");
  const legacyProject = join(directory, ".pi");
  await Promise.all([globalDirectory, legacyAgent, legacyProject].map((path) => mkdir(path, { recursive: true })));
  await Promise.all([
    writeFile(join(legacyAgent, "simple-english.json"), "invalid legacy config"),
    writeFile(join(legacyProject, "simple-english.json"), "invalid legacy config"),
  ]);
  expect((await loadEngine(directory)).config).toEqual({});

  await writeFile(join(globalDirectory, "config.json"), JSON.stringify({
    maxSentenceWords: 30,
    rules: { semicolon: "off", contraction: "soft" },
  }));
  await writeFile(join(directory, ".simple-english.json"), JSON.stringify({
    maxSentenceWords: 20,
    rules: { semicolon: "hard" },
  }));
  expect((await loadEngine(directory)).config).toEqual({
    maxSentenceWords: 20,
    rules: { semicolon: "hard", contraction: "soft" },
  });
});

test("rejects invalid modern configuration and missing approved dictionaries", async () => {
  const configPath = join(directory, ".simple-english.json");
  await writeFile(configPath, JSON.stringify({ rules: { semicolon: "warning" } }));
  await expect(loadEngine(directory)).rejects.toThrow("invalid config");
  await writeFile(configPath, JSON.stringify({ approvedWordsPath: "missing.json" }));
  await expect(loadEngine(directory)).rejects.toThrow();
});
