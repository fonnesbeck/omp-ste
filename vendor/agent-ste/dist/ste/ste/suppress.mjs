import * as $list from "../../gleam_stdlib/gleam/list.mjs";
import * as $result from "../../gleam_stdlib/gleam/result.mjs";
import * as $string from "../../gleam_stdlib/gleam/string.mjs";
import { Ok, Error, toList, Empty as $Empty, CustomType as $CustomType } from "../gleam.mjs";
import * as $rule from "../ste/rule.mjs";
import { Violation } from "../ste/rule.mjs";
import * as $source from "../ste/source.mjs";

class Directive extends $CustomType {
  constructor(covers, line, column, ids, unknown) {
    super();
    this.covers = covers;
    this.line = line;
    this.column = column;
    this.ids = ids;
    this.unknown = unknown;
  }
}

const marker = "ste-disable-next-line";

function is_unknown(name) {
  let _pipe = $rule.from_string(name);
  return $result.is_error(_pipe);
}

/**
 * The names after the marker. A comma and a space both separate two names, and
 * a comment ending such as `-->` or `*\/` is not a name.
 * 
 * @ignore
 */
function names_in(tail) {
  let _pipe = toList(["-->", "*/", ",", "\t"]);
  let _pipe$1 = $list.fold(
    _pipe,
    tail,
    (text, part) => { return $string.replace(text, part, " "); },
  );
  let _pipe$2 = $string.split(_pipe$1, " ");
  return $list.filter(_pipe$2, (name) => { return name !== ""; });
}

function read(line) {
  return $result.try$(
    $string.split_once(line.text, marker),
    (_use0) => {
      let before = _use0[0];
      let tail = _use0[1];
      let names = names_in(tail);
      return new Ok(
        new Directive(
          line.number + 1,
          line.number,
          $string.length(before) + 1,
          $list.filter_map(names, $rule.from_string),
          $list.filter(names, (name) => { return is_unknown(name); }),
        ),
      );
    },
  );
}

/**
 * Every directive in the text, in the order it appears.
 */
export function directives(lines) {
  let _pipe = lines;
  return $list.filter_map(_pipe, read);
}

function is_silent(violation, directives) {
  return $list.any(
    directives,
    (directive) => {
      return (directive.covers === violation.line) && $list.contains(
        directive.ids,
        violation.rule_id,
      );
    },
  );
}

/**
 * Drops every violation that a directive silences.
 */
export function apply(violations, directives) {
  return $list.filter(
    violations,
    (violation) => { return !is_silent(violation, directives); },
  );
}

function reason(directive) {
  let $ = directive.unknown;
  let $1 = directive.ids;
  if ($ instanceof $Empty) {
    if ($1 instanceof $Empty) {
      return new Ok(
        "This comment names no rule, so it silences nothing. Name at least one.",
      );
    } else {
      return new Error(undefined);
    }
  } else {
    return new Ok(
      ("This comment names no such rule: " + $string.join(
        directive.unknown,
        ", ",
      )) + ". Name a rule the engine reports.",
    );
  }
}

function fault(directive) {
  return $result.try$(
    reason(directive),
    (message) => {
      return new Ok(
        new Violation(
          $rule.Id$InvalidDirective$const,
          message,
          directive.line,
          directive.column,
          $rule.severity($rule.Id$InvalidDirective$const),
        ),
      );
    },
  );
}

/**
 * A report for each directive that silences nothing.
 *
 * A comment with a typo in it reads as working and does nothing. So a name the
 * roster does not hold, and a comment with no name at all, both report.
 */
export function faults(directives) {
  let _pipe = directives;
  return $list.filter_map(_pipe, fault);
}
