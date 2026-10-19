import * as $json from "../gleam_json/gleam/json.mjs";
import * as $list from "../gleam_stdlib/gleam/list.mjs";
import * as $result from "../gleam_stdlib/gleam/result.mjs";
import * as $string from "../gleam_stdlib/gleam/string.mjs";
import {
  Ok,
  toList,
  List$Empty$const as $List$Empty$const,
  CustomType as $CustomType,
} from "./gleam.mjs";
import * as $checks from "./ste/checks.mjs";
import * as $dictionary from "./ste/dictionary.mjs";
import * as $rule from "./ste/rule.mjs";
import * as $segment from "./ste/segment.mjs";
import * as $source from "./ste/source.mjs";
import * as $suppress from "./ste/suppress.mjs";
import * as $token from "./ste/token.mjs";

export class Engine extends $CustomType {
  constructor(table, lexer, patterns, splitter) {
    super();
    this.table = table;
    this.lexer = lexer;
    this.patterns = patterns;
    this.splitter = splitter;
  }
}
export const Engine$Engine = (table, lexer, patterns, splitter) =>
  new Engine(table, lexer, patterns, splitter);
export const Engine$isEngine = (value) => value instanceof Engine;
export const Engine$Engine$table = (value) => value.table;
export const Engine$Engine$0 = (value) => value.table;
export const Engine$Engine$lexer = (value) => value.lexer;
export const Engine$Engine$1 = (value) => value.lexer;
export const Engine$Engine$patterns = (value) => value.patterns;
export const Engine$Engine$2 = (value) => value.patterns;
export const Engine$Engine$splitter = (value) => value.splitter;
export const Engine$Engine$3 = (value) => value.splitter;

/**
 * Build this once, then pass it to every lint call. The dictionary and every
 * regexp compile here once, so a caller reuses them for every line.
 */
export function new_engine() {
  return $result.try$(
    $token.lexer(),
    (lexer) => {
      return $result.try$(
        $checks.patterns(),
        (patterns) => {
          return $result.try$(
            $segment.splitter(),
            (splitter) => {
              return new Ok(
                new Engine($dictionary.table(), lexer, patterns, splitter),
              );
            },
          );
        },
      );
    },
  );
}

function paragraph_violations(engine, masked) {
  let _pipe = $segment.paragraphs(engine.splitter, masked);
  return $list.flat_map(_pipe, $checks.paragraph_length);
}

function sentence_violations(engine, masked) {
  let _pipe = $segment.sentences(engine.splitter, masked);
  return $list.flat_map(_pipe, $checks.sentence_length);
}

function line_checks(engine, line) {
  let tokens = $token.tokenize(engine.lexer, line.text);
  return $list.flatten(
    toList([
      $dictionary.check(engine.table, tokens, line),
      $checks.semicolon(line),
      $checks.verb_forms(engine.patterns, line),
    ]),
  );
}

function line_violations(engine, masked) {
  let _pipe = $source.lines(masked);
  return $list.flat_map(
    _pipe,
    (_capture) => { return line_checks(engine, _capture); },
  );
}

export function lint_with(engine, text) {
  let masked = $source.mask(text);
  let directives = $suppress.directives($source.lines(masked));
  let _pipe = $list.flatten(
    toList([
      line_violations(engine, masked),
      sentence_violations(engine, masked),
      paragraph_violations(engine, masked),
    ]),
  );
  let _pipe$1 = $suppress.apply(_pipe, directives);
  return $list.append(_pipe$1, $suppress.faults(directives));
}

/**
 * The JavaScript boundary. It returns JSON so the host never depends on
 * Gleam's internal representation of a List or a custom type. The host holds
 * the opaque `Engine` value and passes it straight back.
 */
export function lint_json_with(engine, text) {
  let _pipe = lint_with(engine, text);
  let _pipe$1 = $json.array(_pipe, $rule.violation_to_json);
  return $json.to_string(_pipe$1);
}

/**
 * Convenience for a one-shot call. It rebuilds the engine, so a caller in a
 * loop must use `new_engine` plus `lint_with` instead.
 */
export function lint(text) {
  let _pipe = new_engine();
  let _pipe$1 = $result.map(
    _pipe,
    (_capture) => { return lint_with(_capture, text); },
  );
  return $result.unwrap(_pipe$1, $List$Empty$const);
}

export function lint_json(text) {
  let _pipe = new_engine();
  let _pipe$1 = $result.map(
    _pipe,
    (_capture) => { return lint_json_with(_capture, text); },
  );
  return $result.unwrap(_pipe$1, "[]");
}

function word_line(entry) {
  let _pipe = entry.forms;
  let _pipe$1 = $list.first(_pipe);
  return $result.map(
    _pipe$1,
    (head) => { return (("- " + entry.approved) + " — not ") + head; },
  );
}

function word_table() {
  let _pipe = $dictionary.entries();
  let _pipe$1 = $list.filter(
    _pipe,
    (entry) => { return entry.approved !== ""; },
  );
  return $list.filter_map(_pipe$1, word_line);
}

/**
 * The system-prompt text, derived from the same table the linter checks. One
 * source of truth means the prompt cannot ask for an unenforced rule. `/ste
 * off` removes both layers at once.
 */
export function prompt_text() {
  let _pipe = toList([
    "## Language: Simplified Technical English (ASD-STE100)",
    "",
    "Write every reply, comment, document, UI string and commit message in",
    "Simplified Technical English.",
    "",
    "### Rules",
    "",
    (() => {
      let _pipe = $rule.all();
      let _pipe$1 = $list.map(_pipe, $rule.to_prompt_line);
      return $string.join(_pipe$1, "\n");
    })(),
    "",
    "### Word choice",
    "",
    "Prefer the word on the left. A write is blocked when the text holds a",
    "word on the right.",
    "",
    (() => {
      let _pipe = word_table();
      return $string.join(_pipe, "\n");
    })(),
    "",
    "### Exceptions",
    "",
    "- Do not rewrite quoted text, tool output, or a file you only read.",
    "- Keep identifiers, code and command syntax exactly as they are.",
    "- A technical name keeps its normal form: TypeScript, Prisma, GraphQL.",
    "- Put correctness first when a rule would make the text wrong.",
  ]);
  return $string.join(_pipe, "\n");
}

/**
 * Every rule name the roster holds, as JSON.
 *
 * A host reads this to check a config file. It returns JSON for the reason
 * `lint_json_with` does, so no host depends on the shape of a Gleam List.
 */
export function rule_names_json() {
  let _pipe = $rule.all();
  let _pipe$1 = $list.map(_pipe, $rule.to_string);
  let _pipe$2 = $json.array(_pipe$1, $json.string);
  return $json.to_string(_pipe$2);
}

/**
 * Text that breaks every rule at once, so the report names every id.
 * 
 * @ignore
 */
function probe_text() {
  let _pipe = toList([
    "We will initiate the change; it is being written.",
    "We have received the file and it isn't complete.",
    "The record was created. Please note that this is a seamless turnkey" + " enterprise data pipeline stream handler.",
    ("Spin up the worker prior to the merge, and then wait for a long" + " sentence that runs past the descriptive limit of twenty five") + " words in total length.",
    "One. Two. Three. Four. Five. Six. Seven. Eight.",
    "<!-- ste-disable-next-line no-such-rule -->",
  ]);
  return $string.join(_pipe, "\n");
}

/**
 * Every rule id the engine can emit. A test compares this against
 * `rule.all()`, so the prompt can never promise an unenforced rule.
 */
export function implemented_rule_ids() {
  let _pipe = probe_text();
  let _pipe$1 = lint(_pipe);
  let _pipe$2 = $list.map(
    _pipe$1,
    (violation) => { return $rule.to_string(violation.rule_id); },
  );
  let _pipe$3 = $list.unique(_pipe$2);
  return $list.sort(_pipe$3, $string.compare);
}
