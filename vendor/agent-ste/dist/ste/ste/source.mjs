import * as $bool from "../../gleam_stdlib/gleam/bool.mjs";
import * as $list from "../../gleam_stdlib/gleam/list.mjs";
import * as $pair from "../../gleam_stdlib/gleam/pair.mjs";
import * as $string from "../../gleam_stdlib/gleam/string.mjs";
import { toList, CustomType as $CustomType } from "../gleam.mjs";

export class Line extends $CustomType {
  constructor(text, number) {
    super();
    this.text = text;
    this.number = number;
  }
}
export const Line$Line = (text, number) => new Line(text, number);
export const Line$isLine = (value) => value instanceof Line;
export const Line$Line$text = (value) => value.text;
export const Line$Line$0 = (value) => value.text;
export const Line$Line$number = (value) => value.number;
export const Line$Line$1 = (value) => value.number;

class Scan extends $CustomType {
  constructor(in_fence, in_front_matter, in_code, after_empty, at_start) {
    super();
    this.in_fence = in_fence;
    this.in_front_matter = in_front_matter;
    this.in_code = in_code;
    this.after_empty = after_empty;
    this.at_start = at_start;
  }
}

class FrontMatterOpen extends $CustomType {}
const Kind$FrontMatterOpen$const = new FrontMatterOpen();

class FrontMatterClose extends $CustomType {}
const Kind$FrontMatterClose$const = new FrontMatterClose();

class FrontMatter extends $CustomType {}
const Kind$FrontMatter$const = new FrontMatter();

class Fence extends $CustomType {}
const Kind$Fence$const = new Fence();

class Fenced extends $CustomType {}
const Kind$Fenced$const = new Fenced();

class Indented extends $CustomType {}
const Kind$Indented$const = new Indented();

class BlankInCode extends $CustomType {}
const Kind$BlankInCode$const = new BlankInCode();

class Prose extends $CustomType {}
const Kind$Prose$const = new Prose();

/**
 * Splits text into numbered lines.
 */
export function lines(text) {
  let _pipe = $string.split(text, "\n");
  return $list.index_map(
    _pipe,
    (text, index) => { return new Line(text, index + 1); },
  );
}

function start() {
  return new Scan(false, false, false, true, true);
}

function mask_grapheme(inside, grapheme) {
  if (grapheme === "`") {
    return [!inside, " "];
  } else if (inside) {
    return [true, " "];
  } else {
    return [false, grapheme];
  }
}

/**
 * Blanks every `inline span` and keeps the line length unchanged.
 * 
 * @ignore
 */
function mask_inline(line) {
  let _pipe = $string.to_graphemes(line);
  let _pipe$1 = $list.map_fold(_pipe, false, mask_grapheme);
  let _pipe$2 = $pair.second(_pipe$1);
  return $string.join(_pipe$2, "");
}

function blank(line) {
  return $string.repeat(" ", $string.length(line));
}

/**
 * The markers CommonMark gives a bullet list. A number list needs a digit, so
 * this checks the first two characters of an ordered marker as well.
 * 
 * @ignore
 */
function starts_a_list(trimmed) {
  let _pipe = toList([
    "- ",
    "* ",
    "+ ",
    "1.",
    "2.",
    "3.",
    "4.",
    "5.",
    "6.",
    "7.",
    "8.",
    "9.",
    "0.",
  ]);
  return $list.any(
    _pipe,
    (_capture) => { return $string.starts_with(trimmed, _capture); },
  );
}

function indent(line) {
  let tabs_widened = $string.replace(line, "\t", "    ");
  return $string.length(tabs_widened) - $string.length(
    $string.trim_start(tabs_widened),
  );
}

/**
 * An indented code block opens after a blank line and stays open while the
 * indent holds. A list marker keeps its line as prose, because a nested list
 * carries the same indent as a code block.
 * 
 * @ignore
 */
function is_indented_code(scan, line, trimmed) {
  let opens = scan.after_empty || scan.in_code;
  return (opens && (indent(line) >= 4)) && !starts_a_list(trimmed);
}

/**
 * A line that holds no text opens no code block. Its indent equals its whole
 * width, so the indent test would read it as code and hold that state open.
 * 
 * @ignore
 */
function text_kind(scan, line, trimmed) {
  return $bool.guard(
    trimmed === "",
    Kind$BlankInCode$const,
    () => {
      let $ = is_indented_code(scan, line, trimmed);
      if ($) {
        return Kind$Indented$const;
      } else {
        return Kind$Prose$const;
      }
    },
  );
}

function is_fence(trimmed) {
  return $string.starts_with(trimmed, "```") || $string.starts_with(
    trimmed,
    "~~~",
  );
}

function body_kind(scan, line, trimmed) {
  let $ = is_fence(trimmed);
  let $1 = scan.in_fence;
  if ($) {
    return Kind$Fence$const;
  } else if ($1) {
    return Kind$Fenced$const;
  } else {
    return text_kind(scan, line, trimmed);
  }
}

/**
 * YAML ends the document with `---` or with `...`.
 * 
 * @ignore
 */
function front_matter_kind(trimmed) {
  let $ = (trimmed === "---") || (trimmed === "...");
  if ($) {
    return Kind$FrontMatterClose$const;
  } else {
    return Kind$FrontMatter$const;
  }
}

/**
 * Names one line, in the order the rules apply. A fence inside front matter is
 * still front matter, so front matter comes first.
 * 
 * @ignore
 */
function kind_of(scan, line, trimmed) {
  let $ = scan.in_front_matter;
  let $1 = scan.at_start && (trimmed === "---");
  if ($) {
    return front_matter_kind(trimmed);
  } else if ($1) {
    return Kind$FrontMatterOpen$const;
  } else {
    return body_kind(scan, line, trimmed);
  }
}

/**
 * Masks one line and reports what the next line inherits.
 * 
 * @ignore
 */
function mask_line(scan, line) {
  let trimmed = $string.trim(line);
  let next = new Scan(
    scan.in_fence,
    scan.in_front_matter,
    scan.in_code,
    line === "",
    false,
  );
  let $ = kind_of(scan, line, trimmed);
  if ($ instanceof FrontMatterOpen) {
    return [
      new Scan(
        next.in_fence,
        true,
        next.in_code,
        next.after_empty,
        next.at_start,
      ),
      blank(line),
    ];
  } else if ($ instanceof FrontMatterClose) {
    return [
      new Scan(
        next.in_fence,
        false,
        next.in_code,
        next.after_empty,
        next.at_start,
      ),
      blank(line),
    ];
  } else if ($ instanceof FrontMatter) {
    return [next, blank(line)];
  } else if ($ instanceof Fence) {
    return [
      new Scan(
        !scan.in_fence,
        next.in_front_matter,
        next.in_code,
        next.after_empty,
        next.at_start,
      ),
      blank(line),
    ];
  } else if ($ instanceof Fenced) {
    return [next, blank(line)];
  } else if ($ instanceof Indented) {
    return [
      new Scan(
        next.in_fence,
        next.in_front_matter,
        true,
        next.after_empty,
        next.at_start,
      ),
      blank(line),
    ];
  } else if ($ instanceof BlankInCode) {
    return [next, line];
  } else {
    return [
      new Scan(
        next.in_fence,
        next.in_front_matter,
        false,
        next.after_empty,
        next.at_start,
      ),
      mask_inline(line),
    ];
  }
}

/**
 * Replaces code with spaces and keeps every line and column intact. It blanks
 * a character and never deletes one, so every later line number stays the
 * same.
 *
 * Four kinds of text hide from the rules. A fenced block and an inline span
 * hide, and so do YAML front matter and an indented code block. Each one holds
 * data or code, and none of them holds prose.
 *
 * Adapted from Ryuketsukami/ste-plain-writing (MIT).
 */
export function mask(text) {
  let _pipe = $string.split(text, "\n");
  let _pipe$1 = $list.map_fold(_pipe, start(), mask_line);
  let _pipe$2 = $pair.second(_pipe$1);
  return $string.join(_pipe$2, "\n");
}
