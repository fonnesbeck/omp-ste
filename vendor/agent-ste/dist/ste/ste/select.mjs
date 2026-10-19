import * as $int from "../../gleam_stdlib/gleam/int.mjs";
import * as $list from "../../gleam_stdlib/gleam/list.mjs";
import * as $pair from "../../gleam_stdlib/gleam/pair.mjs";
import * as $result from "../../gleam_stdlib/gleam/result.mjs";
import * as $string from "../../gleam_stdlib/gleam/string.mjs";
import { Ok, toList, Empty as $Empty, CustomType as $CustomType } from "../gleam.mjs";

/**
 * The whole file, minus code fences and code spans.
 * 
 * @ignore
 */
class Prose extends $CustomType {}
const Kind$Prose$const = new Prose();

/**
 * A `//` comment, and the inside of a `/* *\/` block.
 * 
 * @ignore
 */
class Slash extends $CustomType {}
const Kind$Slash$const = new Slash();

/**
 * A `#` comment.
 * 
 * @ignore
 */
class Hash extends $CustomType {}
const Kind$Hash$const = new Hash();

/**
 * Nothing at all.
 * 
 * @ignore
 */
class Opaque extends $CustomType {}
const Kind$Opaque$const = new Opaque();

class Reader extends $CustomType {
  constructor(marker, tracks_template) {
    super();
    this.marker = marker;
    this.tracks_template = tracks_template;
  }
}

const hash_extensions = /* @__PURE__ */ toList([
  ".sh",
  ".bash",
  ".zsh",
  ".py",
  ".rb",
  ".yml",
  ".yaml",
  ".toml",
  ".just",
]);

const slash_extensions = /* @__PURE__ */ toList([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".jsx",
  ".gleam",
  ".go",
  ".rs",
  ".swift",
  ".kt",
  ".java",
  ".c",
  ".h",
  ".cpp",
]);

const prose_extensions = /* @__PURE__ */ toList([
  ".md",
  ".mdx",
  ".markdown",
  ".txt",
  ".rst",
]);

function blank(text) {
  return $string.repeat(" ", $string.length(text));
}

function occurrences(text, needle) {
  return $list.length($string.split(text, needle)) - 1;
}

/**
 * The count of a character that no backslash escapes.
 *
 * A split counts every occurrence, and a second split counts the escaped ones.
 * The difference needs no lookbehind, which keeps the pattern portable.
 * 
 * @ignore
 */
function count_unescaped(text, character) {
  return occurrences(text, character) - occurrences(text, "\\" + character);
}

function quotes_in(text) {
  let _pipe = toList(["\"", "'", "`"]);
  let _pipe$1 = $list.map(
    _pipe,
    (_capture) => { return count_unescaped(text, _capture); },
  );
  return $int.sum(_pipe$1);
}

function keep_after(marker, line, at) {
  let before = $string.slice(line, 0, at);
  let $ = $int.is_odd(quotes_in(before));
  if ($) {
    return blank(line);
  } else {
    return (blank(before) + blank(marker)) + $string.drop_start(
      line,
      at + $string.length(marker),
    );
  }
}

/**
 * The index of a real marker, or an error when the line holds none.
 *
 * `https://example.com` holds `//` and starts no comment. A colon in front of
 * the marker names a scheme, so the search moves past it and tries again.
 * 
 * @ignore
 */
function marker_at(line, marker, from) {
  let rest = $string.drop_start(line, from);
  return $result.try$(
    $string.split_once(rest, marker),
    (_use0) => {
      let before = _use0[0];
      let at = from + $string.length(before);
      let $ = (at > 0) && ($string.slice(line, at - 1, 1) === ":");
      if ($) {
        return marker_at(line, marker, at + $string.length(marker));
      } else {
        return new Ok(at);
      }
    },
  );
}

function take_comment(marker, line) {
  let $ = marker_at(line, marker, 0);
  if ($ instanceof Ok) {
    let at = $[0];
    return keep_after(marker, line, at);
  } else {
    return blank(line);
  }
}

function read_line(reader) {
  return (in_template, line) => {
    let flips = reader.tracks_template && $int.is_odd(
      count_unescaped(line, "`"),
    );
    if (in_template) {
      return [!flips, blank(line)];
    } else {
      return [flips, take_comment(reader.marker, line)];
    }
  };
}

/**
 * Keeps a `//` or `#` comment body, and blanks the rest.
 *
 * A template literal spans lines, and its text often holds a URL or a word the
 * rules ban. So a backtick count tracks that state across lines. A quote on
 * one line uses a count as well, which is crude, and which needs no parser.
 * 
 * @ignore
 */
function comments_only(content, marker) {
  let reader = new Reader(marker, marker === "//");
  let _pipe = $string.split(content, "\n");
  let _pipe$1 = $list.map_fold(_pipe, false, read_line(reader));
  let _pipe$2 = $pair.second(_pipe$1);
  return $string.join(_pipe$2, "\n");
}

function blank_leading_star(line) {
  let trimmed = $string.trim_start(line);
  let indent = $string.length(line) - $string.length(trimmed);
  let $ = $string.starts_with(trimmed, "*");
  if ($) {
    return $string.repeat(" ", indent + 1) + $string.drop_start(trimmed, 1);
  } else {
    return line;
  }
}

/**
 * Blanks a block marker and a leading star, and keeps every column.
 * 
 * @ignore
 */
function blank_markers(line) {
  let _pipe = line;
  let _pipe$1 = $string.replace(_pipe, "/*", "  ");
  let _pipe$2 = $string.replace(_pipe$1, "*/", "  ");
  return blank_leading_star(_pipe$2);
}

/**
 * True when a line opens a block comment outside a string and outside a
 * comment.
 *
 * Two tests keep it shut. A `/*` after a `//` sits inside that line comment,
 * and a doc comment that names the marker is prose. A `/*` inside a string is
 * data, such as the `".git/*"` of a real ignore list.
 * 
 * @ignore
 */
function opens_block(line) {
  let $ = $string.split_once(line, "/*");
  if ($ instanceof Ok) {
    let before = $[0][0];
    return !$string.contains(before, "//") && !$int.is_odd(quotes_in(before));
  } else {
    return false;
  }
}

function read_block_line(inside, line) {
  let closes = $string.contains(line, "*/");
  let $ = inside || opens_block(line);
  if ($) {
    return [!closes, blank_markers(line)];
  } else {
    return [false, blank(line)];
  }
}

/**
 * Keeps the inside of a block comment, and blanks the rest.
 * 
 * @ignore
 */
function block_comments(content) {
  let _pipe = $string.split(content, "\n");
  let _pipe$1 = $list.map_fold(_pipe, false, read_block_line);
  let _pipe$2 = $pair.second(_pipe$1);
  return $string.join(_pipe$2, "\n");
}

function merge_line(line, mate) {
  let mate_graphemes = $string.to_graphemes(mate);
  let _pipe = $string.to_graphemes(line);
  let _pipe$1 = $list.index_map(
    _pipe,
    (character, column) => {
      if (character === " ") {
        let _pipe$1 = mate_graphemes;
        let _pipe$2 = $list.drop(_pipe$1, column);
        let _pipe$3 = $list.first(_pipe$2);
        return $result.unwrap(_pipe$3, " ");
      } else {
        return character;
      }
    },
  );
  return $string.join(_pipe$1, "");
}

/**
 * Joins two masks. A character wins over a space at the same column.
 * 
 * @ignore
 */
function merge(left, right) {
  let other = $string.split(right, "\n");
  let _pipe = $string.split(left, "\n");
  let _pipe$1 = $list.index_map(
    _pipe,
    (line, index) => {
      let _block;
      let _pipe$1 = other;
      let _pipe$2 = $list.drop(_pipe$1, index);
      let _pipe$3 = $list.first(_pipe$2);
      _block = $result.unwrap(_pipe$3, "");
      let mate = _block;
      return merge_line(line, mate);
    },
  );
  return $string.join(_pipe$1, "\n");
}

/**
 * The extension of a path, in lowercase, with its dot.
 *
 * A name that opens with a dot carries no extension. `.bashrc` names a shell
 * file, and the text before the dot is empty, so the file stays opaque.
 * 
 * @ignore
 */
function extension_of(path) {
  let _block;
  let _pipe = path;
  let _pipe$1 = $string.split(_pipe, "/");
  let _pipe$2 = $list.last(_pipe$1);
  _block = $result.unwrap(_pipe$2, path);
  let base = _block;
  let $ = $string.split(base, ".");
  if ($ instanceof $Empty) {
    return "";
  } else {
    let $1 = $.tail;
    if ($1 instanceof $Empty) {
      return "";
    } else {
      let first = $.head;
      let rest = $1;
      let $2 = (first === "") && ($list.length(rest) === 1);
      if ($2) {
        return "";
      } else {
        let _block$1;
        let _pipe$3 = rest;
        let _pipe$4 = $list.last(_pipe$3);
        _block$1 = $result.unwrap(_pipe$4, "");
        let last = _block$1;
        return $string.lowercase("." + last);
      }
    }
  }
}

function kind_of(extension) {
  if (extension === "") {
    return Kind$Opaque$const;
  } else {
    let $ = $list.contains(prose_extensions, extension);
    let $1 = $list.contains(slash_extensions, extension);
    let $2 = $list.contains(hash_extensions, extension);
    if ($) {
      return Kind$Prose$const;
    } else if ($1) {
      return Kind$Slash$const;
    } else if ($2) {
      return Kind$Hash$const;
    } else {
      return Kind$Opaque$const;
    }
  }
}

/**
 * The lintable view of a file. An empty string means the file holds no prose.
 */
export function lintable_text(path, content) {
  let $ = kind_of(extension_of(path));
  if ($ instanceof Prose) {
    return content;
  } else if ($ instanceof Slash) {
    return merge(comments_only(content, "//"), block_comments(content));
  } else if ($ instanceof Hash) {
    return comments_only(content, "#");
  } else {
    return "";
  }
}
