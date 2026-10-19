import { expect, test } from "bun:test";
import { check, newEngine } from "../src/engine.ts";
import { subjectsOf } from "../src/subjects.ts";

const engine = newEngine();
const bad = "Open the valve; close the cover.";
const good = "Open the valve.";

test.each([
  ["replace", { path: "notes.md", old_string: good, new_string: bad }],
  ["replace batch", { path: "notes.md", edits: [{ old_string: good, new_string: bad }] }],
  ["patch update", { path: "notes.md", edits: [{ diff: `@@\n-${good}\n+${bad}` }] }],
  ["patch create", { path: "notes.md", edits: [{ op: "create", diff: bad }] }],
  ["hashline", { input: `*** Begin Patch\n[notes.md#ABCD]\nPUT 1.=1:\n+${bad}\n*** End Patch` }],
  ["apply patch", { input: `*** Begin Patch\n*** Update File: notes.md\n@@\n-${good}\n+${bad}\n*** End Patch` }],
  ["sloppy", { input: `*** Begin Patch\n*** Edit File: notes.md\n*** Find\n${good}\n*** Replace\n${bad}\n*** End Patch` }],
] satisfies [string, Record<string, unknown>][]) ("%s exposes new prose to the real engine", (_mode, input) => {
  const reports = subjectsOf("edit", input).map(subject => check(engine, subject));
  expect(reports.flatMap(report => report.hard.map(fault => fault.ruleId))).toContain("style/semicolon");
});

test("multi-file hashline edits retain file classification and only remove one body prefix", () => {
  const subjects = subjectsOf("edit", { input: [
    "*** Begin Patch", '["code file.ts"#ABCD]', "PUT >1:",
    `+const utilize = '${bad}';`, "[notes.md#1234]", "PUT >1:", `++ ${bad}`, "*** End Patch",
  ].join("\n") });
  const faults = subjects.flatMap(subject => check(engine, subject).hard.map(fault => ({ path: subject.label, rule: fault.ruleId })));
  expect(faults).toEqual([{ path: "notes.md", rule: "style/semicolon" }]);
});

test("deleted and search text do not block a clean replacement", () => {
  for (const input of [
    { path: "notes.md", old_string: bad, new_string: good },
    { path: "notes.md", edits: [{ diff: `@@\n-${bad}\n+${good}` }] },
    { path: "notes.md", edits: [{ op: "delete" }] },
    { input: `*** Begin Patch\n*** Edit File: notes.md\n*** Find\n+ ${bad}\n*** Replace\n${good}\n*** End Patch` },
  ]) {
    expect(subjectsOf("edit", input).flatMap(subject => check(engine, subject).hard)).toEqual([]);
  }
});

test("renames classify additions at the destination, and encoded SSH paths retain comment checks", () => {
  for (const input of [
    { path: "notes.json", edits: [{ rename: "notes.md", diff: `@@\n+${bad}` }] },
    { input: `*** Begin Patch\n*** Update File: notes.json\n*** Move to: notes.md\n@@\n+${bad}\n*** End Patch` },
  ]) {
    expect(subjectsOf("edit", input).flatMap(subject => check(engine, subject).hard.map(fault => fault.ruleId))).toContain("style/semicolon");
  }
  expect(subjectsOf("write", { path: "ssh://host/tmp/file.%74%73", content: `// ${bad}` })
    .flatMap(subject => check(engine, subject).hard.map(fault => fault.ruleId))).toContain("style/semicolon");
});
