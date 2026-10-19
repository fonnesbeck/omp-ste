import * as $regexp from "../../gleam_regexp/gleam/regexp.mjs";
import * as $bool from "../../gleam_stdlib/gleam/bool.mjs";
import * as $int from "../../gleam_stdlib/gleam/int.mjs";
import * as $list from "../../gleam_stdlib/gleam/list.mjs";
import * as $option from "../../gleam_stdlib/gleam/option.mjs";
import { Some, Option$None$const } from "../../gleam_stdlib/gleam/option.mjs";
import * as $result from "../../gleam_stdlib/gleam/result.mjs";
import * as $string from "../../gleam_stdlib/gleam/string.mjs";
import {
  toList,
  List$Empty$const as $List$Empty$const,
  CustomType as $CustomType,
} from "../gleam.mjs";
import * as $rule from "../ste/rule.mjs";
import { Violation, Severity$Hard$const, Severity$Soft$const } from "../ste/rule.mjs";
import * as $scan from "../ste/scan.mjs";
import * as $segment from "../ste/segment.mjs";
import * as $source from "../ste/source.mjs";

class Check extends $CustomType {
  constructor(patterns, id, advice) {
    super();
    this.patterns = patterns;
    this.id = id;
    this.advice = advice;
  }
}

class Patterns extends $CustomType {
  constructor(probes) {
    super();
    this.probes = probes;
  }
}

class Overflow extends $CustomType {
  constructor(limit, advice, severity) {
    super();
    this.limit = limit;
    this.advice = advice;
    this.severity = severity;
  }
}

/**
 * `'s` is the only ambiguous case. `repo's` is a possessive, not a
 * contraction, so a bare `\w+'s` rule reports a false positive. Only this
 * fixed set of stems forms a real `'s` contraction.
 * 
 * @ignore
 */
const contraction_s_stems = "(?:it|he|she|that|what|who|there|here|let|one|where|how|everyone|everybody|something|nothing|somebody|nobody)";

/**
 * A form of `be`, at the start of a word.
 *
 * The boundary carries the rule. Without it, the `is` inside `this` matches,
 * and `this morning` reports a progressive verb. `his meeting` and `axis
 * rotating` fall the same way, and each one blocks a write.
 * 
 * @ignore
 */
const be = "\\b(?:am|is|are|was|were|be|been|being)";

/**
 * An irregular past participle does not end in "ed", so list the common ones.
 * Adapted from Ryuketsukami/ste-plain-writing (MIT).
 * 
 * @ignore
 */
const irregular = "(?:done|made|sent|read|built|kept|held|set|put|run|written|shown|given|taken|found|got|gotten|seen|known|thrown|drawn)";

/**
 * A word that carries a verb ending but states no action.
 *
 * Each verb rule matches an auxiliary, then a word that ends in `ing` or
 * `ed`. That shape also fits `the file is missing`, where the second word
 * describes. A part-of-speech tagger tells the two apart, and this engine
 * holds none. A count over 402,000 words of real prose chose these words, and
 * `running` stays out. A false report blocks a write, so the list takes the
 * safer error.
 * 
 * @ignore
 */
const not_a_verb = /* @__PURE__ */ toList([
  "nothing",
  "something",
  "anything",
  "everything",
  "string",
  "warning",
  "meaning",
  "spelling",
  "wording",
  "heading",
  "missing",
  "pending",
  "confusing",
  "interesting",
  "existing",
  "remaining",
  "outstanding",
  "ongoing",
  "upcoming",
  "incoming",
  "outgoing",
  "underlying",
  "noncapturing",
  "breaking",
  "willing",
  "advanced",
  "limited",
  "detailed",
  "related",
  "dedicated",
  "complicated",
  "sophisticated",
  "deprecated",
  "mixed",
  "varied",
]);

/**
 * STE caps an instruction sentence at 20 words and a descriptive sentence at
 * 25. A linter cannot reliably tell the two apart, so over 25 is Hard and 21
 * to 25 is Soft.
 * 
 * @ignore
 */
const instruction_limit = 20;

const descriptive_limit = 25;

const paragraph_limit = 6;

/**
 * An auxiliary verb, then a past participle.
 * 
 * @ignore
 */
function participle(auxiliary) {
  return ((auxiliary + "\\s+(?:\\w+ed|") + irregular) + ")\\b";
}

/**
 * Every regexp rule, one row each. A row pairs its patterns with the rule and
 * the advice to report. The rule gives the severity.
 * 
 * @ignore
 */
function table() {
  return toList([
    new Check(
      toList([be + "\\s+\\w+ing\\b"]),
      $rule.Id$Progressive$const,
      "Use a simple tense. Do not use the progressive.",
    ),
    new Check(
      toList([participle("\\b(?:have|has|had)")]),
      $rule.Id$Perfect$const,
      "Use the simple past. Do not use the perfect tense.",
    ),
    new Check(
      toList([participle(be)]),
      $rule.Id$Passive$const,
      "Use the active voice, unless the actor is unknown.",
    ),
    new Check(
      toList([
        "\\w+['\u{2019}](?:t|re|ve|ll|d|m)\\b",
        ("\\b" + contraction_s_stems) + "['\u{2019}]s\\b",
      ]),
      $rule.Id$Contraction$const,
      "Do not use a contraction. Write the words in full.",
    ),
  ]);
}

function compile(pattern) {
  let _pipe = $regexp.from_string(pattern);
  return $result.replace_error(_pipe, undefined);
}

function compile_check(spec) {
  let _pipe = $list.try_map(spec.patterns, compile);
  return $result.map(
    _pipe,
    (patterns) => { return new Check(patterns, spec.id, spec.advice); },
  );
}

export function patterns() {
  let _pipe = table();
  let _pipe$1 = $list.try_map(_pipe, compile_check);
  return $result.map(_pipe$1, (var0) => { return new Patterns(var0); });
}

function last_word(content) {
  let _pipe = content;
  let _pipe$1 = $string.replace(_pipe, "\t", " ");
  let _pipe$2 = $string.split(_pipe$1, " ");
  let _pipe$3 = $list.filter(_pipe$2, (word) => { return word !== ""; });
  return $list.last(_pipe$3);
}

/**
 * True when the last word of a match states no action. The caller lowercases
 * the text, so this compares lowercase only.
 * 
 * @ignore
 */
function states_no_action(content) {
  let _pipe = content;
  let _pipe$1 = last_word(_pipe);
  let _pipe$2 = $result.map(
    _pipe$1,
    (_capture) => { return $list.contains(not_a_verb, _capture); },
  );
  return $result.unwrap(_pipe$2, false);
}

function scan_one(pattern, probe, line) {
  let severity = $rule.severity(probe.id);
  let _pipe = $regexp.scan(pattern, $string.lowercase(line.text));
  let _pipe$1 = $list.filter(
    _pipe,
    (match) => { return !states_no_action(match.content); },
  );
  return $list.map(
    _pipe$1,
    (match) => {
      return new Violation(
        probe.id,
        ((probe.advice + " Found: \"") + match.content) + "\".",
        line.number,
        $scan.first_column(line.text, match.content),
        severity,
      );
    },
  );
}

function matches(probe, line) {
  let _pipe = probe.patterns;
  return $list.flat_map(
    _pipe,
    (pattern) => { return scan_one(pattern, probe, line); },
  );
}

export function verb_forms(patterns, line) {
  let _pipe = patterns.probes;
  return $list.flat_map(
    _pipe,
    (_capture) => { return matches(_capture, line); },
  );
}

export function semicolon(line) {
  let _pipe = $scan.columns(line.text, ";");
  return $list.map(
    _pipe,
    (column) => {
      return new Violation(
        $rule.Id$Semicolon$const,
        "Do not use a semicolon. Write two sentences.",
        line.number,
        column,
        $rule.severity($rule.Id$Semicolon$const),
      );
    },
  );
}

function too_long(sentence, over) {
  return new Violation(
    $rule.Id$SentenceLength$const,
    (((("This sentence has " + $int.to_string(sentence.words)) + " words. ") + over.advice) + $int.to_string(
      over.limit,
    )) + ".",
    sentence.line,
    sentence.column,
    over.severity,
  );
}

/**
 * This names each severity, because one rule reports both.
 * 
 * @ignore
 */
function overflow(words) {
  let $ = words > descriptive_limit;
  let $1 = words > instruction_limit;
  if ($) {
    return new Some(
      new Overflow(
        descriptive_limit,
        "Write no more than ",
        Severity$Hard$const,
      ),
    );
  } else if ($1) {
    return new Some(
      new Overflow(
        instruction_limit,
        "An instruction takes no more than ",
        Severity$Soft$const,
      ),
    );
  } else {
    return Option$None$const;
  }
}

export function sentence_length(sentence) {
  let $ = overflow(sentence.words);
  if ($ instanceof Some) {
    let over = $[0];
    return toList([too_long(sentence, over)]);
  } else {
    return $List$Empty$const;
  }
}

export function paragraph_length(paragraph) {
  let count = $list.length(paragraph.sentences);
  return $bool.guard(
    count <= paragraph_limit,
    $List$Empty$const,
    () => {
      return toList([
        new Violation(
          $rule.Id$ParagraphLength$const,
          ((("This paragraph has " + $int.to_string(count)) + " sentences. Write no more than ") + $int.to_string(
            paragraph_limit,
          )) + ".",
          paragraph.line,
          1,
          $rule.severity($rule.Id$ParagraphLength$const),
        ),
      ]);
    },
  );
}
