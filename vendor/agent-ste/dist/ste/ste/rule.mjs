import * as $json from "../../gleam_json/gleam/json.mjs";
import * as $list from "../../gleam_stdlib/gleam/list.mjs";
import { toList, CustomType as $CustomType } from "../gleam.mjs";

export class NotApprovedWord extends $CustomType {}
export const Id$NotApprovedWord$const = new NotApprovedWord();
export const Id$NotApprovedWord = () => Id$NotApprovedWord$const;
export const Id$isNotApprovedWord = (value) => value instanceof NotApprovedWord;

export class SentenceLength extends $CustomType {}
export const Id$SentenceLength$const = new SentenceLength();
export const Id$SentenceLength = () => Id$SentenceLength$const;
export const Id$isSentenceLength = (value) => value instanceof SentenceLength;

export class ParagraphLength extends $CustomType {}
export const Id$ParagraphLength$const = new ParagraphLength();
export const Id$ParagraphLength = () => Id$ParagraphLength$const;
export const Id$isParagraphLength = (value) => value instanceof ParagraphLength;

export class Progressive extends $CustomType {}
export const Id$Progressive$const = new Progressive();
export const Id$Progressive = () => Id$Progressive$const;
export const Id$isProgressive = (value) => value instanceof Progressive;

export class Perfect extends $CustomType {}
export const Id$Perfect$const = new Perfect();
export const Id$Perfect = () => Id$Perfect$const;
export const Id$isPerfect = (value) => value instanceof Perfect;

export class Passive extends $CustomType {}
export const Id$Passive$const = new Passive();
export const Id$Passive = () => Id$Passive$const;
export const Id$isPassive = (value) => value instanceof Passive;

export class Contraction extends $CustomType {}
export const Id$Contraction$const = new Contraction();
export const Id$Contraction = () => Id$Contraction$const;
export const Id$isContraction = (value) => value instanceof Contraction;

export class Semicolon extends $CustomType {}
export const Id$Semicolon$const = new Semicolon();
export const Id$Semicolon = () => Id$Semicolon$const;
export const Id$isSemicolon = (value) => value instanceof Semicolon;

export class PhrasalVerb extends $CustomType {}
export const Id$PhrasalVerb$const = new PhrasalVerb();
export const Id$PhrasalVerb = () => Id$PhrasalVerb$const;
export const Id$isPhrasalVerb = (value) => value instanceof PhrasalVerb;

export class Hedge extends $CustomType {}
export const Id$Hedge$const = new Hedge();
export const Id$Hedge = () => Id$Hedge$const;
export const Id$isHedge = (value) => value instanceof Hedge;

export class Marketing extends $CustomType {}
export const Id$Marketing$const = new Marketing();
export const Id$Marketing = () => Id$Marketing$const;
export const Id$isMarketing = (value) => value instanceof Marketing;

export class InvalidDirective extends $CustomType {}
export const Id$InvalidDirective$const = new InvalidDirective();
export const Id$InvalidDirective = () => Id$InvalidDirective$const;
export const Id$isInvalidDirective = (value) =>
  value instanceof InvalidDirective;

/**
 * The check is deterministic. The host may block the write.
 */
export class Hard extends $CustomType {}
export const Severity$Hard$const = new Hard();
export const Severity$Hard = () => Severity$Hard$const;
export const Severity$isHard = (value) => value instanceof Hard;

/**
 * The check is a heuristic. The host must only warn.
 */
export class Soft extends $CustomType {}
export const Severity$Soft$const = new Soft();
export const Severity$Soft = () => Severity$Soft$const;
export const Severity$isSoft = (value) => value instanceof Soft;

export class Violation extends $CustomType {
  constructor(rule_id, message, line, column, severity) {
    super();
    this.rule_id = rule_id;
    this.message = message;
    this.line = line;
    this.column = column;
    this.severity = severity;
  }
}
export const Violation$Violation = (rule_id, message, line, column, severity) =>
  new Violation(rule_id, message, line, column, severity);
export const Violation$isViolation = (value) => value instanceof Violation;
export const Violation$Violation$rule_id = (value) => value.rule_id;
export const Violation$Violation$0 = (value) => value.rule_id;
export const Violation$Violation$message = (value) => value.message;
export const Violation$Violation$1 = (value) => value.message;
export const Violation$Violation$line = (value) => value.line;
export const Violation$Violation$2 = (value) => value.line;
export const Violation$Violation$column = (value) => value.column;
export const Violation$Violation$3 = (value) => value.column;
export const Violation$Violation$severity = (value) => value.severity;
export const Violation$Violation$4 = (value) => value.severity;

/**
 * The roster. A test proves that every rule here can fire.
 */
export function all() {
  return toList([
    Id$NotApprovedWord$const,
    Id$SentenceLength$const,
    Id$ParagraphLength$const,
    Id$Progressive$const,
    Id$Perfect$const,
    Id$Passive$const,
    Id$Contraction$const,
    Id$Semicolon$const,
    Id$PhrasalVerb$const,
    Id$Hedge$const,
    Id$Marketing$const,
    Id$InvalidDirective$const,
  ]);
}

/**
 * The name the host, the CLI and the prompt all report.
 */
export function to_string(id) {
  if (id instanceof NotApprovedWord) {
    return "dictionary/not-approved-word";
  } else if (id instanceof SentenceLength) {
    return "length/sentence";
  } else if (id instanceof ParagraphLength) {
    return "length/paragraph";
  } else if (id instanceof Progressive) {
    return "verb/progressive";
  } else if (id instanceof Perfect) {
    return "verb/perfect";
  } else if (id instanceof Passive) {
    return "verb/passive";
  } else if (id instanceof Contraction) {
    return "style/contraction";
  } else if (id instanceof Semicolon) {
    return "style/semicolon";
  } else if (id instanceof PhrasalVerb) {
    return "style/phrasal-verb";
  } else if (id instanceof Hedge) {
    return "style/hedge";
  } else if (id instanceof Marketing) {
    return "style/marketing";
  } else {
    return "suppress/invalid-directive";
  }
}

/**
 * Reads a rule id back from its name. A suppression comment names a rule. A
 * name the roster does not hold is a fault, and the reader must see it.
 */
export function from_string(name) {
  let _pipe = all();
  return $list.find(_pipe, (id) => { return to_string(id) === name; });
}

/**
 * The severity a rule reports. Two sites narrow this to Soft: a sentence
 * between the two length limits, and a not-approved word inside a hyphen.
 */
export function severity(id) {
  if (id instanceof NotApprovedWord) {
    return Severity$Hard$const;
  } else if (id instanceof SentenceLength) {
    return Severity$Hard$const;
  } else if (id instanceof ParagraphLength) {
    return Severity$Hard$const;
  } else if (id instanceof Progressive) {
    return Severity$Hard$const;
  } else if (id instanceof Perfect) {
    return Severity$Hard$const;
  } else if (id instanceof Passive) {
    return Severity$Soft$const;
  } else if (id instanceof Contraction) {
    return Severity$Hard$const;
  } else if (id instanceof Semicolon) {
    return Severity$Hard$const;
  } else if (id instanceof PhrasalVerb) {
    return Severity$Hard$const;
  } else if (id instanceof Hedge) {
    return Severity$Soft$const;
  } else if (id instanceof Marketing) {
    return Severity$Soft$const;
  } else {
    return Severity$Hard$const;
  }
}

/**
 * The rule as the system prompt states it.
 * 
 * @ignore
 */
function prompt(id) {
  if (id instanceof NotApprovedWord) {
    return "Use one word for one meaning. Prefer the approved word.";
  } else if (id instanceof SentenceLength) {
    return "Write no more than 20 words in an instruction sentence, and no more than 25 in a descriptive sentence.";
  } else if (id instanceof ParagraphLength) {
    return "Write no more than 6 sentences in an instruction paragraph, and no more than 3 in a descriptive paragraph.";
  } else if (id instanceof Progressive) {
    return "Use the simple tenses only. Do not write \"is removing\".";
  } else if (id instanceof Perfect) {
    return "Do not use the perfect tenses. Write \"we received\", not \"we have received\".";
  } else if (id instanceof Passive) {
    return "Use the active voice for an instruction. Passive voice is allowed in descriptive text only when the actor is unknown.";
  } else if (id instanceof Contraction) {
    return "Do not use a contraction. Write \"do not\", not \"don't\".";
  } else if (id instanceof Semicolon) {
    return "Do not use a semicolon. Write two sentences.";
  } else if (id instanceof PhrasalVerb) {
    return "Do not use a phrasal verb. Write \"start\", not \"spin up\".";
  } else if (id instanceof Hedge) {
    return "Do not hedge. Delete \"it is important to note\".";
  } else if (id instanceof Marketing) {
    return "Do not use a marketing adjective such as \"seamless\" or \"robust\".";
  } else {
    return "A \"ste-disable-next-line\" comment must name at least one real rule id.";
  }
}

export function to_prompt_line(id) {
  return ((("- " + prompt(id)) + " (") + to_string(id)) + ")";
}

function severity_to_string(value) {
  if (value instanceof Hard) {
    return "hard";
  } else {
    return "soft";
  }
}

export function violation_to_json(violation) {
  return $json.object(
    toList([
      ["ruleId", $json.string(to_string(violation.rule_id))],
      ["message", $json.string(violation.message)],
      ["line", $json.int(violation.line)],
      ["column", $json.int(violation.column)],
      ["severity", $json.string(severity_to_string(violation.severity))],
    ]),
  );
}
