import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ConfigError,
  check,
  commitSubject,
  editSubject,
  fileSubject,
  lint,
  loadConfig,
  newEngine,
  promptText,
  replyFaults,
  replySubject,
  ruleNames,
  summarise,
} from "../src/engine.ts";

let directory: string;
let oldXdg: string | undefined;
let oldConfig: string | undefined;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "omp-ste-config-"));
  oldXdg = process.env.XDG_CONFIG_HOME;
  oldConfig = process.env.STE_CONFIG;
  process.env.XDG_CONFIG_HOME = join(directory, "config");
  delete process.env.STE_CONFIG;
  await writeFile(join(directory, ".ste.json"), "{}");
});

afterEach(async () => {
  for (const [key, value] of [
    ["XDG_CONFIG_HOME", oldXdg],
    ["STE_CONFIG", oldConfig],
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await rm(directory, { recursive: true, force: true });
});

test("merges global settings with the nearest ancestor .ste.json", async () => {
  const globalDirectory = join(directory, "config", "ste");
  const projectDirectory = join(directory, "project");
  const nestedDirectory = join(projectDirectory, "src", "nested");
  await Promise.all([
    mkdir(globalDirectory, { recursive: true }),
    mkdir(nestedDirectory, { recursive: true }),
  ]);
  const globalPath = join(globalDirectory, "config.json");
  const projectPath = join(projectDirectory, ".ste.json");
  await writeFile(globalPath, JSON.stringify({
    rules: { "style/semicolon": "off", "style/contraction": "soft" },
  }));
  await writeFile(projectPath, JSON.stringify({
    rules: { "style/semicolon": "hard" },
  }));
  await writeFile(join(directory, ".ste.json"), "invalid distant config");

  expect(loadConfig(nestedDirectory, ruleNames())).toEqual({
    rules: { "style/semicolon": "hard", "style/contraction": "soft" },
    paths: [globalPath, projectPath],
    path: projectPath,
  });
});

test("STE_CONFIG replaces the XDG file and requires an existing valid file", async () => {
  const globalDirectory = join(directory, "config", "ste");
  await mkdir(globalDirectory, { recursive: true });
  await writeFile(join(globalDirectory, "config.json"), "invalid unused config");
  const namedPath = join(directory, "fleet.json");
  process.env.STE_CONFIG = namedPath;
  expect(() => loadConfig(directory, ruleNames())).toThrow(ConfigError);
  await writeFile(namedPath, JSON.stringify({ rules: { "style/semicolon": "soft" } }));
  const config = loadConfig(directory, ruleNames());
  expect(config.rules).toEqual({ "style/semicolon": "soft" });
  expect(config.paths).toEqual([namedPath, join(directory, ".ste.json")]);
});

test("rejects unknown settings, rule names, severities and invalid JSON", async () => {
  const path = join(directory, ".ste.json");
  for (const content of [
    '{"replyReport":"hard"}',
    '{"rules":{"semicolon":"off"}}',
    '{"rules":{"style/semicolon":"warning"}}',
    "{",
  ]) {
    await writeFile(path, content);
    expect(() => loadConfig(directory, ruleNames())).toThrow(ConfigError);
  }
});

test("hard faults block, soft faults still reach replies, and off rules leave the prompt", () => {
  const text = "Open the file; read the file.";
  const subject = replySubject(text)!;
  const hard = check(newEngine(), subject);
  expect(hard.violations).toEqual([expect.objectContaining({
    ruleId: "style/semicolon",
    column: 14,
    severity: "hard",
  })]);
  expect(summarise(hard.violations)).toEqual({ hard: 1, soft: 0 });
  expect(hard.reason).toContain("[style/semicolon]");

  const softEngine = newEngine({ rules: { "style/semicolon": "soft" } });
  const soft = check(softEngine, subject);
  expect(soft.reason).toBeUndefined();
  expect(summarise(soft.violations)).toEqual({ hard: 0, soft: 1 });
  expect(replyFaults(softEngine, subject)).toEqual(soft.soft);

  const offEngine = newEngine({ rules: { "style/semicolon": "off" } });
  expect(lint(offEngine, text)).toEqual([]);
  expect(promptText(offEngine)).not.toContain("(style/semicolon)");
  expect(promptText(offEngine)).toContain("(style/contraction)");
});

test("preserves source positions while masking code and honoring rule suppressions", () => {
  const engine = newEngine();
  const text = [
    "`utilize;`",
    "```ts",
    "const utilize = ';';",
    "```",
    "<!-- ste-disable-next-line style/semicolon -->",
    "Open the file; read the file.",
    "Open the file; read the file.",
  ].join("\n");
  expect(lint(engine, text)).toEqual([expect.objectContaining({
    ruleId: "style/semicolon", line: 7, column: 14, severity: "hard",
  })]);
  expect(lint(engine, "<!-- ste-disable-next-line no-such-rule -->")).toEqual([
    expect.objectContaining({ ruleId: "suppress/invalid-directive", severity: "hard" }),
  ]);
  expect(lint(engine, "Utilize the file.")).toEqual([
    expect.objectContaining({ ruleId: "dictionary/not-approved-word", severity: "hard" }),
  ]);
});

test("selects file comments, replacement text and prose message flags", () => {
  const engine = newEngine();
  const source = fileSubject("main.ts", "const text = 'utilize;';\n// Open the file; read the file.")!;
  expect(lint(engine, source.text)).toEqual([
    expect.objectContaining({ ruleId: "style/semicolon", line: 2, column: 17 }),
  ]);
  expect(fileSubject("data.json", '{"text":"utilize;"}')).toBeUndefined();
  expect(editSubject("notes.md", ["Open the file.", "Read the file."])).toEqual({
    text: "Open the file.\nRead the file.", label: "notes.md",
  });
  expect(commitSubject('git commit -am "Open the file" --message="Read the file"')).toEqual({
    text: "Open the file\n\nRead the file", label: "the commit message",
  });
  expect(commitSubject('notify --message "Open the file"')).toEqual({
    text: "Open the file", label: "the message",
  });
  expect(commitSubject("mkdir -m 755 output")).toBeUndefined();
  expect(replySubject(" \n ")).toBeUndefined();
});
