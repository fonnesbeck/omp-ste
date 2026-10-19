import * as $list from "../../gleam_stdlib/gleam/list.mjs";
import * as $pair from "../../gleam_stdlib/gleam/pair.mjs";
import * as $result from "../../gleam_stdlib/gleam/result.mjs";
import * as $string from "../../gleam_stdlib/gleam/string.mjs";
import { Ok, CustomType as $CustomType } from "../gleam.mjs";

class Found extends $CustomType {
  constructor(column, before, after) {
    super();
    this.column = column;
    this.before = before;
    this.after = after;
  }
}

/**
 * The caller lowercases both sides, so this list holds lowercase only.
 * 
 * @ignore
 */
const word_characters = "abcdefghijklmnopqrstuvwxyz0123456789_";

/**
 * A split gives an exact column for a repeat. `regexp.scan` cannot, because
 * gleam_regexp reports match content but no offset.
 * 
 * @ignore
 */
function found(haystack, needle) {
  let _pipe = $string.split(haystack, needle);
  let _pipe$1 = $list.window_by_2(_pipe);
  let _pipe$2 = $list.map_fold(
    _pipe$1,
    0,
    (start, sides) => {
      let before = sides[0];
      let after = sides[1];
      let at = start + $string.length(before);
      return [at + $string.length(needle), new Found(at + 1, before, after)];
    },
  );
  return $pair.second(_pipe$2);
}

/**
 * Every 1-based column where `needle` appears.
 */
export function columns(haystack, needle) {
  let _pipe = found(haystack, needle);
  return $list.map(_pipe, (one) => { return one.column; });
}

/**
 * An edge of the haystack counts as a boundary, so `Error` gives True.
 * 
 * @ignore
 */
function is_boundary(edge) {
  if (edge instanceof Ok) {
    let character = edge[0];
    return !$string.contains(word_characters, character);
  } else {
    return true;
  }
}

function is_whole_word(one) {
  return is_boundary($string.last(one.before)) && is_boundary(
    $string.first(one.after),
  );
}

/**
 * Every 1-based column where `needle` appears as a whole word or phrase.
 */
export function occurrences(haystack, needle) {
  let _pipe = found($string.lowercase(haystack), $string.lowercase(needle));
  let _pipe$1 = $list.filter(_pipe, is_whole_word);
  return $list.map(_pipe$1, (one) => { return one.column; });
}

/**
 * The column of the first whole-word match, or 1 when there is none.
 */
export function first_column(haystack, needle) {
  let _pipe = occurrences(haystack, needle);
  let _pipe$1 = $list.first(_pipe);
  return $result.unwrap(_pipe$1, 1);
}
