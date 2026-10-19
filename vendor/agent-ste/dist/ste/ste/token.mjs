import * as $regexp from "../../gleam_regexp/gleam/regexp.mjs";
import * as $bool from "../../gleam_stdlib/gleam/bool.mjs";
import * as $list from "../../gleam_stdlib/gleam/list.mjs";
import * as $option from "../../gleam_stdlib/gleam/option.mjs";
import { Some, Option$None$const } from "../../gleam_stdlib/gleam/option.mjs";
import * as $pair from "../../gleam_stdlib/gleam/pair.mjs";
import * as $result from "../../gleam_stdlib/gleam/result.mjs";
import * as $string from "../../gleam_stdlib/gleam/string.mjs";
import { Ok, Error, Empty as $Empty, CustomType as $CustomType } from "../gleam.mjs";

export class Token extends $CustomType {
  constructor(lower, column) {
    super();
    this.lower = lower;
    this.column = column;
  }
}
export const Token$Token = (lower, column) => new Token(lower, column);
export const Token$isToken = (value) => value instanceof Token;
export const Token$Token$lower = (value) => value.lower;
export const Token$Token$0 = (value) => value.lower;
export const Token$Token$column = (value) => value.column;
export const Token$Token$1 = (value) => value.column;

export class Lexer extends $CustomType {
  constructor(pattern) {
    super();
    this.pattern = pattern;
  }
}
export const Lexer$Lexer = (pattern) => new Lexer(pattern);
export const Lexer$isLexer = (value) => value instanceof Lexer;
export const Lexer$Lexer$pattern = (value) => value.pattern;
export const Lexer$Lexer$0 = (value) => value.pattern;

/**
 * Group 1 takes the run of non-word characters before a word. Group 2 takes
 * the word. An apostrophe keeps `don't` whole and a hyphen keeps
 * `state-of-the-art` whole.
 * 
 * @ignore
 */
const word_pattern = "([^a-z0-9_'\u{2019}-]*)([a-z0-9_'\u{2019}-]+)";

export function lexer() {
  let _pipe = $regexp.from_string(word_pattern);
  let _pipe$1 = $result.map(_pipe, (var0) => { return new Lexer(var0); });
  return $result.replace_error(_pipe$1, undefined);
}

function width(text) {
  let _pipe = text;
  let _pipe$1 = $option.map(_pipe, $string.length);
  return $option.unwrap(_pipe$1, 0);
}

/**
 * Places one match and returns the position where the next one starts.
 * 
 * @ignore
 */
function take_token(position, match) {
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
          let separator = $.head;
          let word = $2[0];
          let start = position + width(separator);
          let token = new Token(word, start + 1);
          return [start + $string.length(word), new Some(token)];
        } else {
          return [position, Option$None$const];
        }
      } else {
        return [position, Option$None$const];
      }
    }
  }
}

/**
 * Splits a line into word tokens and records the 1-based column of each.
 *
 * One native regexp pass does the work. The regexp keeps each separator in a
 * capture group, so a running sum of lengths gives an exact column.
 * gleam_regexp does not report a match offset.
 */
export function tokenize(lexer, line) {
  let _pipe = $regexp.scan(lexer.pattern, $string.lowercase(line));
  let _pipe$1 = $list.map_fold(_pipe, 0, take_token);
  let _pipe$2 = $pair.second(_pipe$1);
  return $option.values(_pipe$2);
}

/**
 * The n-gram of exactly `size` tokens at the head of the list, or an error
 * when the list is too short. A caller tries the longest size first, so a
 * phrase entry like `prior to` beats the single word `prior`.
 */
export function ngram_at(tokens, size) {
  let taken = $list.take(tokens, size);
  return $bool.guard(
    $list.length(taken) !== size,
    new Error(undefined),
    () => {
      let _pipe = taken;
      let _pipe$1 = $list.map(_pipe, (token) => { return token.lower; });
      let _pipe$2 = $string.join(_pipe$1, " ");
      return new Ok(_pipe$2);
    },
  );
}
