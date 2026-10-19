import * as $bool from "../../gleam_stdlib/gleam/bool.mjs";
import * as $dict from "../../gleam_stdlib/gleam/dict.mjs";
import * as $int from "../../gleam_stdlib/gleam/int.mjs";
import * as $list from "../../gleam_stdlib/gleam/list.mjs";
import * as $pair from "../../gleam_stdlib/gleam/pair.mjs";
import * as $result from "../../gleam_stdlib/gleam/result.mjs";
import * as $set from "../../gleam_stdlib/gleam/set.mjs";
import * as $string from "../../gleam_stdlib/gleam/string.mjs";
import {
  Ok,
  Error,
  toList,
  Empty as $Empty,
  List$Empty$const as $List$Empty$const,
  prepend as listPrepend,
  CustomType as $CustomType,
} from "../gleam.mjs";
import * as $rule from "../ste/rule.mjs";
import { Violation, Severity$Soft$const } from "../ste/rule.mjs";
import * as $source from "../ste/source.mjs";
import * as $token from "../ste/token.mjs";

/**
 * `forms` lists every spelling to flag. An explicit list beats a suffix
 * regexp: `\bprior\w*` also matches "priority", and an English verb stem
 * drops its "e" before "-ing".
 */
export class Entry extends $CustomType {
  constructor(forms, approved, id) {
    super();
    this.forms = forms;
    this.approved = approved;
    this.id = id;
  }
}
export const Entry$Entry = (forms, approved, id) =>
  new Entry(forms, approved, id);
export const Entry$isEntry = (value) => value instanceof Entry;
export const Entry$Entry$forms = (value) => value.forms;
export const Entry$Entry$0 = (value) => value.forms;
export const Entry$Entry$approved = (value) => value.approved;
export const Entry$Entry$1 = (value) => value.approved;
export const Entry$Entry$id = (value) => value.id;
export const Entry$Entry$2 = (value) => value.id;

export class Replacement extends $CustomType {
  constructor(approved, id, severity) {
    super();
    this.approved = approved;
    this.id = id;
    this.severity = severity;
  }
}
export const Replacement$Replacement = (approved, id, severity) =>
  new Replacement(approved, id, severity);
export const Replacement$isReplacement = (value) =>
  value instanceof Replacement;
export const Replacement$Replacement$approved = (value) => value.approved;
export const Replacement$Replacement$0 = (value) => value.approved;
export const Replacement$Replacement$id = (value) => value.id;
export const Replacement$Replacement$1 = (value) => value.id;
export const Replacement$Replacement$severity = (value) => value.severity;
export const Replacement$Replacement$2 = (value) => value.severity;

class Match extends $CustomType {
  constructor(found, replacement, size, offset) {
    super();
    this.found = found;
    this.replacement = replacement;
    this.size = size;
    this.offset = offset;
  }
}

/**
 * `phrase_starts` holds the first word of every multi-word entry. Most
 * tokens start no phrase, so the common path costs one Dict lookup instead
 * of one lookup per n-gram size.
 */
export class Table extends $CustomType {
  constructor(replacements, phrase_starts, max_words) {
    super();
    this.replacements = replacements;
    this.phrase_starts = phrase_starts;
    this.max_words = max_words;
  }
}
export const Table$Table = (replacements, phrase_starts, max_words) =>
  new Table(replacements, phrase_starts, max_words);
export const Table$isTable = (value) => value instanceof Table;
export const Table$Table$replacements = (value) => value.replacements;
export const Table$Table$0 = (value) => value.replacements;
export const Table$Table$phrase_starts = (value) => value.phrase_starts;
export const Table$Table$1 = (value) => value.phrase_starts;
export const Table$Table$max_words = (value) => value.max_words;
export const Table$Table$2 = (value) => value.max_words;

class Search extends $CustomType {
  constructor(table, line) {
    super();
    this.table = table;
    this.line = line;
  }
}

function phrase_length(phrase) {
  let _pipe = $string.split(phrase, " ");
  return $list.length(_pipe);
}

function first_word(phrase) {
  let _pipe = $string.split(phrase, " ");
  return $list.first(_pipe);
}

/**
 * Every spelling of one entry, paired with the replacement to report.
 * 
 * @ignore
 */
function entry_forms(entry) {
  let replacement = new Replacement(
    entry.approved,
    entry.id,
    $rule.severity(entry.id),
  );
  let _pipe = entry.forms;
  return $list.map(_pipe, (form) => { return [form, replacement]; });
}

function marketing_entries() {
  let _pipe = toList([
    "seamless",
    "seamlessly",
    "robust",
    "powerful",
    "cutting-edge",
    "effortless",
    "effortlessly",
    "world-class",
    "next-generation",
    "revolutionary",
    "blazing",
    "lightning-fast",
    "elegant",
    "delightful",
    "turnkey",
    "best-in-class",
    "state-of-the-art",
    "game-changing",
    "battle-tested",
    "enterprise-grade",
    "supercharge",
    "unleash",
    "empower",
    "empowers",
    "blazingly",
    "industry-leading",
    "rock-solid",
    "bulletproof",
    "gorgeous",
    "sleek",
    "intuitive",
    "unparalleled",
    "premier",
    "innovative",
    "disruptive",
    "frictionless",
    "bleeding-edge",
    "buttery-smooth",
    "transformative",
    "tapestry",
    "mission-critical",
  ]);
  return $list.map(
    _pipe,
    (word) => { return new Entry(toList([word]), "", $rule.Id$Marketing$const); },
  );
}

function hedge_entries() {
  let _pipe = toList([
    "it is important to note",
    "it should be noted",
    "it is worth noting",
    "please note that",
    "as mentioned",
    "as noted above",
    "obviously",
    "of course",
    "needless to say",
    "it goes without saying",
    "arguably",
    "essentially",
    "basically",
    "in essence",
    "at the end of the day",
    "to be honest",
    "in my opinion",
    "somewhat",
    "notably",
    "at its core",
  ]);
  return $list.map(
    _pipe,
    (phrase) => { return new Entry(toList([phrase]), "", $rule.Id$Hedge$const); },
  );
}

function phrasal_verb_entries() {
  let _pipe = toList([
    [toList(["spin up", "spins up", "spun up"]), "start"],
    [toList(["spin down", "spins down"]), "stop"],
    [toList(["tear down", "tears down"]), "remove"],
    [toList(["reach out", "reaches out", "reaching out"]), "ask"],
    [toList(["dive into", "dives into", "diving into"]), "examine"],
    [toList(["kick off", "kicks off"]), "start"],
    [toList(["roll out", "rolls out"]), "release"],
    [toList(["ramp up", "ramps up"]), "increase"],
    [toList(["circle back"]), "return to"],
    [toList(["drill down"]), "examine"],
  ]);
  return $list.map(
    _pipe,
    (pair) => { return new Entry(pair[0], pair[1], $rule.Id$PhrasalVerb$const); },
  );
}

/**
 * Verbose phrases. A multi-word entry carries no second sense, so it reports
 * no false positive. Each one measured 0 hits in correct technical prose.
 * 
 * @ignore
 */
function verbose_phrase_entries() {
  let _pipe = toList([
    [toList(["at this point in time", "at the present time"]), "now"],
    [toList(["for the purpose of"]), "to"],
    [toList(["in accordance with"]), "as"],
    [toList(["with regard to", "with regards to", "in relation to"]), "about"],
    [toList(["the majority of"]), "most"],
    [toList(["a number of"]), "some"],
    [toList(["a large number of"]), "many"],
    [toList(["on a regular basis"]), "often"],
    [toList(["in the near future"]), "soon"],
    [toList(["it is possible that"]), "maybe"],
    [toList(["in spite of the fact that", "despite the fact that"]), "although"],
    [toList(["in light of the fact that", "for the reason that"]), "because"],
    [toList(["in the absence of"]), "without"],
    [toList(["in excess of"]), "more than"],
    [toList(["in conjunction with"]), "with"],
    [toList(["by means of"]), "by"],
    [toList(["with the exception of"]), "except"],
    [toList(["in order that"]), "so"],
    [toList(["when it comes to"]), "for"],
    [toList(["in the event of"]), "if"],
  ]);
  return $list.map(
    _pipe,
    (pair) => {
      return new Entry(pair[0], pair[1], $rule.Id$NotApprovedWord$const);
    },
  );
}

function phrase_entries() {
  let _pipe = toList([
    [toList(["prior to"]), "before"],
    [toList(["subsequent to"]), "after"],
    [toList(["in order to"]), "to"],
    [toList(["a variety of"]), "some"],
    [toList(["in the event that"]), "if"],
    [toList(["due to the fact that"]), "because"],
    [toList(["is able to", "are able to"]), "can"],
    [toList(["make use of", "makes use of"]), "use"],
  ]);
  return $list.map(
    _pipe,
    (pair) => {
      return new Entry(pair[0], pair[1], $rule.Id$NotApprovedWord$const);
    },
  );
}

/**
 * `perform` -> `perform`, `performs`, `performed`, `performing`
 * 
 * @ignore
 */
function consonant_verb(infinitive) {
  return toList([
    infinitive,
    infinitive + "s",
    infinitive + "ed",
    infinitive + "ing",
  ]);
}

/**
 * `initiate` -> `initiate`, `initiates`, `initiated`, `initiating`
 * 
 * @ignore
 */
function silent_e_verb(infinitive) {
  let stem = $string.drop_end(infinitive, 1);
  return toList([infinitive, infinitive + "s", infinitive + "d", stem + "ing"]);
}

/**
 * Inflated diction. A model reaches for these words, and each one has a
 * plainer form. Every entry here measured 0 hits in 143,000 words of correct
 * technical prose.
 * 
 * @ignore
 */
function formal_word_entries() {
  let _pipe = toList([
    [silent_e_verb("cease"), "stop"],
    [silent_e_verb("delve"), "examine"],
    [toList(["elevate", "elevates", "elevating"]), "improve"],
    [silent_e_verb("streamline"), "simplify"],
    [silent_e_verb("constitute"), "form"],
    [silent_e_verb("showcase"), "show"],
    [silent_e_verb("anticipate"), "expect"],
    [consonant_verb("exhibit"), "show"],
    [consonant_verb("foster"), "help"],
    [consonant_verb("bolster"), "support"],
    [consonant_verb("embark"), "start"],
    [consonant_verb("employ"), "use"],
    [consonant_verb("ascertain"), "find"],
    [consonant_verb("endeavour"), "try"],
    [consonant_verb("endeavor"), "try"],
    [toList(["possess", "possesses", "possessed", "possessing"]), "have"],
    [toList(["crucial", "crucially"]), "important"],
    [toList(["vital"]), "important"],
    [toList(["pivotal"]), "key"],
    [toList(["optimal"]), "best"],
    [toList(["albeit"]), "although"],
    [toList(["regarding"]), "about"],
    [toList(["concerning"]), "about"],
    [toList(["pertaining"]), "about"],
    [toList(["consequently"]), "so"],
    [toList(["nevertheless", "nonetheless"]), "but"],
    [toList(["thus", "hence", "thereby", "therefore"]), "so"],
    [toList(["akin"]), "similar"],
    [toList(["holistic"]), "complete"],
    [toList(["paradigm"]), "model"],
    [toList(["testament"]), "proof"],
    [toList(["meticulous", "meticulously"]), "careful"],
    [toList(["intricate"]), "complex"],
    [toList(["profound", "profoundly"]), "deep"],
    [toList(["nuanced"]), "subtle"],
    [toList(["cornerstone"]), "base"],
    [toList(["paramount"]), "most important"],
  ]);
  return $list.map(
    _pipe,
    (pair) => {
      return new Entry(pair[0], pair[1], $rule.Id$NotApprovedWord$const);
    },
  );
}

/**
 * `modify` -> `modify`, `modifies`, `modified`, `modifying`
 * 
 * @ignore
 */
function y_verb(infinitive) {
  let stem = $string.drop_end(infinitive, 1);
  return toList([infinitive, stem + "ies", stem + "ied", infinitive + "ing"]);
}

function word_entries() {
  let _pipe = toList([
    [silent_e_verb("initiate"), "start"],
    [silent_e_verb("commence"), "start"],
    [silent_e_verb("utilize"), "use"],
    [silent_e_verb("utilise"), "use"],
    [silent_e_verb("ensure"), "make sure"],
    [silent_e_verb("terminate"), "stop"],
    [silent_e_verb("facilitate"), "help"],
    [silent_e_verb("locate"), "find"],
    [silent_e_verb("indicate"), "show"],
    [silent_e_verb("require"), "need"],
    [silent_e_verb("purchase"), "buy"],
    [silent_e_verb("leverage"), "use"],
    [silent_e_verb("acquire"), "get"],
    [silent_e_verb("demonstrate"), "show"],
    [silent_e_verb("originate"), "start"],
    [consonant_verb("perform"), "do"],
    [consonant_verb("obtain"), "get"],
    [consonant_verb("attempt"), "try"],
    [consonant_verb("assist"), "help"],
    [consonant_verb("permit"), "let"],
    [y_verb("modify"), "change"],
    [toList(["begin", "begins", "began", "beginning"]), "start"],
    [toList(["approximately"]), "about"],
    [toList(["sufficient"]), "enough"],
    [toList(["subsequent", "subsequently"]), "next"],
    [toList(["prior"]), "before"],
    [toList(["additional", "additionally"]), "more"],
    [toList(["furthermore", "moreover"]), "also"],
    [toList(["comprehensive", "comprehensively"]), "complete"],
    [toList(["utilization"]), "use"],
    [toList(["aforementioned"]), "this"],
    [toList(["whilst"]), "while"],
    [toList(["amongst"]), "among"],
    [toList(["numerous", "myriad", "plethora"]), "many"],
  ]);
  return $list.map(
    _pipe,
    (pair) => {
      return new Entry(pair[0], pair[1], $rule.Id$NotApprovedWord$const);
    },
  );
}

/**
 * ASD limits redistribution of the full ASD-STE100 dictionary, which holds
 * roughly 900 approved words and roughly 1,200 words to avoid. This table
 * holds widely-cited pairs only. The standard's terminology allowance lets a
 * project add its own approved technical nouns and verbs. The host can load a
 * local file to extend this table.
 *
 * The phrasal-verb, hedge and marketing lists come from
 * Ryuketsukami/ste-plain-writing (MIT).
 */
export function entries() {
  return $list.flatten(
    toList([
      word_entries(),
      formal_word_entries(),
      phrase_entries(),
      verbose_phrase_entries(),
      phrasal_verb_entries(),
      hedge_entries(),
      marketing_entries(),
    ]),
  );
}

/**
 * Build this ONCE and reuse it. Gleam has no module-level mutable state and a
 * `const` cannot hold a Dict, so the host owns the value.
 */
export function table() {
  let _block;
  let _pipe = entries();
  _block = $list.flat_map(_pipe, entry_forms);
  let forms = _block;
  let _block$1;
  let _pipe$1 = forms;
  let _pipe$2 = $list.map(_pipe$1, $pair.first);
  _block$1 = $list.filter(
    _pipe$2,
    (entry) => { return phrase_length(entry) > 1; },
  );
  let entries$1 = _block$1;
  let _block$2;
  let _pipe$3 = entries$1;
  let _pipe$4 = $list.filter_map(_pipe$3, first_word);
  _block$2 = $set.from_list(_pipe$4);
  let phrase_starts = _block$2;
  let _block$3;
  let _pipe$5 = entries$1;
  let _pipe$6 = $list.map(_pipe$5, phrase_length);
  _block$3 = $list.fold(_pipe$6, 1, $int.max);
  let max_words = _block$3;
  return new Table($dict.from_list(forms), phrase_starts, max_words);
}

function message_for(replacement, found) {
  let $ = replacement.approved;
  if ($ === "") {
    return ("Delete \"" + found) + "\".";
  } else {
    let approved = $;
    return ((("Use \"" + approved) + "\", not \"") + found) + "\".";
  }
}

function to_violation(line, head, match) {
  return new Violation(
    match.replacement.id,
    message_for(match.replacement, match.found),
    line.number,
    head.column + match.offset,
    match.replacement.severity,
  );
}

function part_lookup(table, part) {
  let text = part[0];
  let offset = part[1];
  return $result.try$(
    $dict.get(table.replacements, text),
    (replacement) => {
      return new Ok(
        new Match(
          text,
          new Replacement(
            replacement.approved,
            replacement.id,
            Severity$Soft$const,
          ),
          1,
          offset,
        ),
      );
    },
  );
}

/**
 * Pairs each part with its offset in the token. The extra 1 covers the hyphen
 * the split removed.
 * 
 * @ignore
 */
function with_offsets(parts) {
  let _pipe = parts;
  let _pipe$1 = $list.map_fold(
    _pipe,
    0,
    (offset, part) => {
      return [(offset + $string.length(part)) + 1, [part, offset]];
    },
  );
  return $pair.second(_pipe$1);
}

/**
 * The lexer keeps a hyphen inside a word, so `state-of-the-art` stays whole.
 * That also hides a not-approved word in `auto-initiate`, so each part of a
 * hyphenated token gets one more look.
 *
 * A part always reports Soft, even when the whole word reports Hard. A part can
 * come from a branch name such as `fix/initiate-flow`, and a Hard block there
 * stops real work. The first matching part wins, because one report per token
 * is enough to prompt a rewrite.
 * 
 * @ignore
 */
function part_match(table, head) {
  return $bool.guard(
    !$string.contains(head.lower, "-"),
    new Error(undefined),
    () => {
      let _pipe = $string.split(head.lower, "-");
      let _pipe$1 = with_offsets(_pipe);
      return $list.find_map(
        _pipe$1,
        (_capture) => { return part_lookup(table, _capture); },
      );
    },
  );
}

/**
 * The hot path: one lookup, and a hyphen part only when that lookup misses.
 * 
 * @ignore
 */
function word_match(table, head) {
  let _pipe = $dict.get(table.replacements, head.lower);
  let _pipe$1 = $result.map(
    _pipe,
    (replacement) => { return new Match(head.lower, replacement, 1, 0); },
  );
  return $result.lazy_or(_pipe$1, () => { return part_match(table, head); });
}

function sized_match(table, tokens, size) {
  return $result.try$(
    $token.ngram_at(tokens, size),
    (ngram) => {
      return $result.try$(
        $dict.get(table.replacements, ngram),
        (replacement) => {
          return new Ok(new Match(ngram, replacement, size, 0));
        },
      );
    },
  );
}

/**
 * Tries the longest n-gram first, so `prior to` beats `prior`.
 * 
 * @ignore
 */
function phrase_match(table, tokens, size) {
  return $bool.guard(
    size <= 0,
    new Error(undefined),
    () => {
      let _pipe = sized_match(table, tokens, size);
      return $result.lazy_or(
        _pipe,
        () => { return phrase_match(table, tokens, size - 1); },
      );
    },
  );
}

function longest_match(table, tokens) {
  return $result.try$(
    $list.first(tokens),
    (head) => {
      let $ = $set.contains(table.phrase_starts, head.lower);
      if ($) {
        return phrase_match(table, tokens, table.max_words);
      } else {
        return word_match(table, head);
      }
    },
  );
}

/**
 * Greedy longest match. `prior to` must consume both tokens, or the entry for
 * `prior` reports the same span again.
 * 
 * @ignore
 */
function check_loop(loop$search, loop$tokens, loop$found) {
  while (true) {
    let search = loop$search;
    let tokens = loop$tokens;
    let found = loop$found;
    if (tokens instanceof $Empty) {
      return $list.reverse(found);
    } else {
      let head = tokens.head;
      let rest = tokens.tail;
      let $ = longest_match(search.table, tokens);
      if ($ instanceof Ok) {
        let match = $[0];
        loop$search = search;
        loop$tokens = $list.drop(tokens, match.size);
        loop$found = listPrepend(to_violation(search.line, head, match), found);
      } else {
        loop$search = search;
        loop$tokens = rest;
        loop$found = found;
      }
    }
  }
}

export function check(table, tokens, line) {
  return check_loop(new Search(table, line), tokens, $List$Empty$const);
}
