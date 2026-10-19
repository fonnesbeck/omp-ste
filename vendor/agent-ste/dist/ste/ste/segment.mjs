import * as $regexp from "../../gleam_regexp/gleam/regexp.mjs";
import * as $list from "../../gleam_stdlib/gleam/list.mjs";
import * as $option from "../../gleam_stdlib/gleam/option.mjs";
import { Some, Option$None$const } from "../../gleam_stdlib/gleam/option.mjs";
import * as $pair from "../../gleam_stdlib/gleam/pair.mjs";
import * as $result from "../../gleam_stdlib/gleam/result.mjs";
import * as $string from "../../gleam_stdlib/gleam/string.mjs";
import {
  Ok,
  toList,
  Empty as $Empty,
  List$Empty$const as $List$Empty$const,
  prepend as listPrepend,
  CustomType as $CustomType,
} from "../gleam.mjs";
import * as $source from "../ste/source.mjs";

export class Sentence extends $CustomType {
  constructor(text, line, column, words) {
    super();
    this.text = text;
    this.line = line;
    this.column = column;
    this.words = words;
  }
}
export const Sentence$Sentence = (text, line, column, words) =>
  new Sentence(text, line, column, words);
export const Sentence$isSentence = (value) => value instanceof Sentence;
export const Sentence$Sentence$text = (value) => value.text;
export const Sentence$Sentence$0 = (value) => value.text;
export const Sentence$Sentence$line = (value) => value.line;
export const Sentence$Sentence$1 = (value) => value.line;
export const Sentence$Sentence$column = (value) => value.column;
export const Sentence$Sentence$2 = (value) => value.column;
export const Sentence$Sentence$words = (value) => value.words;
export const Sentence$Sentence$3 = (value) => value.words;

export class Paragraph extends $CustomType {
  constructor(sentences, line) {
    super();
    this.sentences = sentences;
    this.line = line;
  }
}
export const Paragraph$Paragraph = (sentences, line) =>
  new Paragraph(sentences, line);
export const Paragraph$isParagraph = (value) => value instanceof Paragraph;
export const Paragraph$Paragraph$sentences = (value) => value.sentences;
export const Paragraph$Paragraph$0 = (value) => value.sentences;
export const Paragraph$Paragraph$line = (value) => value.line;
export const Paragraph$Paragraph$1 = (value) => value.line;

export class Blank extends $CustomType {}
export const LineKind$Blank$const = new Blank();
export const LineKind$Blank = () => LineKind$Blank$const;
export const LineKind$isBlank = (value) => value instanceof Blank;

export class Heading extends $CustomType {}
export const LineKind$Heading$const = new Heading();
export const LineKind$Heading = () => LineKind$Heading$const;
export const LineKind$isHeading = (value) => value instanceof Heading;

export class TableRow extends $CustomType {}
export const LineKind$TableRow$const = new TableRow();
export const LineKind$TableRow = () => LineKind$TableRow$const;
export const LineKind$isTableRow = (value) => value instanceof TableRow;

export class ListItem extends $CustomType {}
export const LineKind$ListItem$const = new ListItem();
export const LineKind$ListItem = () => LineKind$ListItem$const;
export const LineKind$isListItem = (value) => value instanceof ListItem;

export class Prose extends $CustomType {}
export const LineKind$Prose$const = new Prose();
export const LineKind$Prose = () => LineKind$Prose$const;
export const LineKind$isProse = (value) => value instanceof Prose;

class Placed extends $CustomType {
  constructor(number, indent, offset) {
    super();
    this.number = number;
    this.indent = indent;
    this.offset = offset;
  }
}

class Block extends $CustomType {
  constructor(text, lines, line) {
    super();
    this.text = text;
    this.lines = lines;
    this.line = line;
  }
}

class Grouping extends $CustomType {
  constructor(done, open) {
    super();
    this.done = done;
    this.open = open;
  }
}

class Splitter extends $CustomType {
  constructor(sentence, list_marker) {
    super();
    this.sentence = sentence;
    this.list_marker = list_marker;
  }
}

const list_marker_pattern = "^(?:[-*+]\\s|\\d+[.)]\\s)";

/**
 * Group 1 takes leading whitespace, group 2 takes the sentence. A running sum
 * of both gives an exact offset, which gleam_regexp does not report.
 *
 * A terminator ends a sentence only before whitespace or the end of the text.
 * A period inside `a.io`, `rule.gleam` or `1.2.3` then stays where it is. The
 * second branch takes a last fragment that carries no terminator.
 * 
 * @ignore
 */
const sentence_pattern = "(\\s*)([^\n]*?[.!?]+(?=\\s|$)|[^\n]+$)";

const small_openers = "abcdefghijklmnopqrstuvwxyz0123456789";

const lowercase_letters = "abcdefghijklmnopqrstuvwxyz";

/**
 * A title always takes a name, so the sentence stays open across it.
 * 
 * @ignore
 */
const titles = /* @__PURE__ */ toList(["dr.", "mr.", "mrs.", "ms.", "prof."]);

/**
 * The caller lowercases the text, so this list holds lowercase only.
 * 
 * @ignore
 */
const word_characters = "abcdefghijklmnopqrstuvwxyz0123456789";

function compile(pattern) {
  let _pipe = $regexp.from_string(pattern);
  return $result.replace_error(_pipe, undefined);
}

export function splitter() {
  return $result.try$(
    compile(sentence_pattern),
    (sentence) => {
      return $result.try$(
        compile(list_marker_pattern),
        (list_marker) => { return new Ok(new Splitter(sentence, list_marker)); },
      );
    },
  );
}

/**
 * A line that starts no marker is a list item or plain prose.
 * 
 * @ignore
 */
function body_kind(splitter, trimmed) {
  let $ = $regexp.check(splitter.list_marker, trimmed);
  if ($) {
    return LineKind$ListItem$const;
  } else {
    return LineKind$Prose$const;
  }
}

export function classify(splitter, line) {
  let trimmed = $string.trim(line);
  let $ = $string.first(trimmed);
  if ($ instanceof Ok) {
    let $1 = $[0];
    if ($1 === "|") {
      return LineKind$TableRow$const;
    } else if ($1 === "#") {
      return LineKind$Heading$const;
    } else {
      return body_kind(splitter, trimmed);
    }
  } else {
    return LineKind$Blank$const;
  }
}

function merge(first, second) {
  return new Sentence(
    (first.text + " ") + second.text,
    first.line,
    first.column,
    first.words + second.words,
  );
}

/**
 * A fragment that opens with a lowercase letter or a digit continues the
 * sentence before it. `Fig. 3` and `e.g. this` both land here.
 *
 * This test reads case, so it must not lowercase the character first. That
 * mistake matches every letter and joins a whole paragraph into one sentence.
 * 
 * @ignore
 */
function opens_small(text) {
  let $ = $string.first(text);
  if ($ instanceof Ok) {
    let character = $[0];
    return $string.contains(small_openers, character);
  } else {
    return false;
  }
}

/**
 * Four characters at most, and a period at the end. `e.g.`, `Fig.` and the
 * `1.` of a list marker all fit. `mode.` and `point.` do not.
 * 
 * @ignore
 */
function is_abbreviation(word) {
  return ($string.length(word) <= 4) && $string.ends_with(word, ".");
}

/**
 * The caller lowercases the word, so this reads lowercase only.
 * 
 * @ignore
 */
function opens_with_letter(word) {
  let $ = $string.first(word);
  if ($ instanceof Ok) {
    let character = $[0];
    return $string.contains(lowercase_letters, character);
  } else {
    return false;
  }
}

/**
 * One letter and a period, such as the `J.` of `J. Smith`.
 *
 * A digit does not count here. `exit code 2. A linter` holds two sentences,
 * and a digit test joins them into one long one.
 * 
 * @ignore
 */
function is_initial(word) {
  return (($string.length(word) === 2) && $string.ends_with(word, ".")) && opens_with_letter(
    word,
  );
}

function holds_open(word) {
  return $list.contains(titles, word) || is_initial(word);
}

function last_word(text) {
  let _pipe = text;
  let _pipe$1 = $string.lowercase(_pipe);
  let _pipe$2 = $string.split(_pipe$1, " ");
  let _pipe$3 = $list.filter(_pipe$2, (word) => { return word !== ""; });
  let _pipe$4 = $list.last(_pipe$3);
  return $result.unwrap(_pipe$4, "");
}

/**
 * A title or an initial always takes a name. Any other abbreviation needs a
 * small opener after it, so `etc. Then stop.` keeps its two sentences.
 *
 * The abbreviation must be short. A mask blanks an inline span, so a sentence
 * that opens with one reads as lowercase after the trim. A length cap keeps
 * `holds it.` and `mode.` from taking the sentence that follows.
 * 
 * @ignore
 */
function continues(previous, next) {
  let word = last_word(previous.text);
  return holds_open(word) || (is_abbreviation(word) && opens_small(next.text));
}

/**
 * The newest sentence comes first, so a join rewrites the head of the list.
 * 
 * @ignore
 */
function absorb(done, gapped) {
  let gap = gapped[0];
  let next = gapped[1];
  let _block;
  let _pipe = done;
  let _pipe$1 = $list.first(_pipe);
  let _pipe$2 = $result.map(
    _pipe$1,
    (_capture) => { return continues(_capture, next); },
  );
  _block = $result.unwrap(_pipe$2, false);
  let follows = _block;
  let joins = (gap <= 1) && follows;
  if (done instanceof $Empty) {
    return listPrepend(next, done);
  } else if (joins) {
    let previous = done.head;
    let rest = done.tail;
    return listPrepend(merge(previous, next), rest);
  } else {
    return listPrepend(next, done);
  }
}

/**
 * Joins a fragment to the sentence before it.
 *
 * A period ends an abbreviation as well as a sentence. `e.g.`, `Fig.` and a
 * list marker such as `1.` all hold one, so the pattern splits where a reader
 * does not. Real prose opens a sentence with a capital. So a fragment that
 * opens with a lowercase letter or a digit continues the one before it. A
 * title and an initial hold a sentence open across a capital name.
 * 
 * @ignore
 */
function join_fragments(sentences) {
  let _pipe = sentences;
  let _pipe$1 = $list.fold(_pipe, $List$Empty$const, absorb);
  return $list.reverse(_pipe$1);
}

function has_letter_or_digit(word) {
  let _pipe = $string.to_graphemes($string.lowercase(word));
  return $list.any(
    _pipe,
    (grapheme) => { return $string.contains(word_characters, grapheme); },
  );
}

/**
 * Counts words the way a reader does. A hyphenated compound counts once, and a
 * bare number counts as a word.
 */
export function word_count(text) {
  let _pipe = $string.split(text, " ");
  return $list.count(_pipe, has_letter_or_digit);
}

/**
 * Maps an offset in the joined block text back to a real line and column.
 * 
 * @ignore
 */
function place(block, offset, text) {
  let _block;
  let _pipe = block.lines;
  let _pipe$1 = $list.filter(_pipe, (one) => { return one.offset <= offset; });
  let _pipe$2 = $list.last(_pipe$1);
  _block = $result.unwrap(_pipe$2, new Placed(block.line, 0, 0));
  let placed = _block;
  return new Sentence(
    text,
    placed.number,
    ((offset - placed.offset) + placed.indent) + 1,
    word_count(text),
  );
}

function width(value) {
  let _pipe = value;
  let _pipe$1 = $option.map(_pipe, $string.length);
  return $option.unwrap(_pipe$1, 0);
}

/**
 * Places one match and returns the offset where the next one starts.
 * 
 * @ignore
 */
function take_sentence(block, position, match) {
  let $ = match.submatches;
  if ($ instanceof $Empty) {
    return [position, Option$None$const];
  } else {
    let $1 = $.tail;
    if ($1 instanceof $Empty) {
      return [position, Option$None$const];
    } else {
      let $2 = $1.head;
      if ($2 instanceof Some) {
        let $3 = $1.tail;
        if ($3 instanceof $Empty) {
          let leading = $.head;
          let text = $2[0];
          let gap = width(leading);
          let start = position + gap;
          let next = start + $string.length(text);
          let $4 = $string.trim(text);
          if ($4 === "") {
            return [next, Option$None$const];
          } else {
            let trimmed = $4;
            return [next, new Some([gap, place(block, start, trimmed)])];
          }
        } else {
          return [position, Option$None$const];
        }
      } else {
        return [position, Option$None$const];
      }
    }
  }
}

function sentences_of_block(splitter, block) {
  let _pipe = $regexp.scan(splitter.sentence, block.text);
  let _pipe$1 = $list.map_fold(
    _pipe,
    0,
    (position, match) => { return take_sentence(block, position, match); },
  );
  let _pipe$2 = $pair.second(_pipe$1);
  let _pipe$3 = $option.values(_pipe$2);
  return join_fragments(_pipe$3);
}

function first_number(lines) {
  let _pipe = lines;
  let _pipe$1 = $list.first(_pipe);
  let _pipe$2 = $result.map(_pipe$1, (line) => { return line.number; });
  return $result.unwrap(_pipe$2, 1);
}

function body(line) {
  return $string.trim(line.text);
}

function indent(line) {
  return $string.length(line.text) - $string.length(
    $string.trim_start(line.text),
  );
}

/**
 * A joined block separates lines with one space, so each body starts one
 * character after the body before it ends.
 * 
 * @ignore
 */
function place_lines(lines) {
  let _pipe = lines;
  let _pipe$1 = $list.map_fold(
    _pipe,
    0,
    (start, line) => {
      let placed = new Placed(line.number, indent(line), start);
      return [(start + $string.length(body(line))) + 1, placed];
    },
  );
  return $pair.second(_pipe$1);
}

function build_block(lines) {
  return new Block(
    (() => {
      let _pipe = lines;
      let _pipe$1 = $list.map(_pipe, body);
      return $string.join(_pipe$1, " ");
    })(),
    place_lines(lines),
    first_number(lines),
  );
}

/**
 * Closes the open run. The newest block comes first.
 * 
 * @ignore
 */
function flush(state) {
  let $ = $list.reverse(state.open);
  if ($ instanceof $Empty) {
    return state.done;
  } else {
    let ordered = $;
    return listPrepend(build_block(ordered), state.done);
  }
}

function group(splitter, state, line) {
  let $ = classify(splitter, line.text);
  if ($ instanceof Blank) {
    return new Grouping(flush(state), $List$Empty$const);
  } else if ($ instanceof Heading) {
    return new Grouping(flush(state), $List$Empty$const);
  } else if ($ instanceof TableRow) {
    return new Grouping(flush(state), $List$Empty$const);
  } else if ($ instanceof ListItem) {
    return new Grouping(
      listPrepend(build_block(toList([line])), flush(state)),
      $List$Empty$const,
    );
  } else {
    return new Grouping(state.done, listPrepend(line, state.open));
  }
}

/**
 * Groups lines into blocks and joins each block with a single space.
 *
 * A hard-wrapped sentence then reads as one string, so a length count and a
 * sentence count stay correct.
 * 
 * @ignore
 */
function blocks(splitter, text) {
  let _pipe = $source.lines(text);
  let _pipe$1 = $list.fold(
    _pipe,
    new Grouping($List$Empty$const, $List$Empty$const),
    (state, line) => { return group(splitter, state, line); },
  );
  let _pipe$2 = flush(_pipe$1);
  return $list.reverse(_pipe$2);
}

/**
 * A paragraph is a run of prose lines.
 *
 * A blank line, a heading and a table row all end it. A list item is its own
 * paragraph. STE asks a writer to REPLACE a long prose paragraph with a
 * vertical list. A rule that counts the list as one paragraph punishes the fix
 * it recommends.
 */
export function paragraphs(splitter, text) {
  let _pipe = blocks(splitter, text);
  return $list.map(
    _pipe,
    (block) => {
      return new Paragraph(sentences_of_block(splitter, block), block.line);
    },
  );
}

export function sentences(splitter, text) {
  let _pipe = blocks(splitter, text);
  return $list.flat_map(
    _pipe,
    (_capture) => { return sentences_of_block(splitter, _capture); },
  );
}
