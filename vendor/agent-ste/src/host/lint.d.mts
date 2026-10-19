// Local declarations for the unchanged agent-ste 0.5.2 host boundary.
export type RuleId =
  | "dictionary/not-approved-word"
  | "length/sentence"
  | "length/paragraph"
  | "verb/progressive"
  | "verb/perfect"
  | "verb/passive"
  | "style/contraction"
  | "style/semicolon"
  | "style/phrasal-verb"
  | "style/hedge"
  | "style/marketing"
  | "suppress/invalid-directive";

export type Severity = "hard" | "soft";
export type RuleSetting = Severity | "off";
export type RuleSettings = Partial<Record<RuleId, RuleSetting>>;

export interface Config {
  rules?: RuleSettings;
}

// Gleam's compiled value is opaque to hosts and is only passed back to Gleam.
declare const compiledEngine: unique symbol;
export interface CompiledEngine {
  readonly [compiledEngine]: true;
}

export interface Engine {
  compiled: CompiledEngine;
  rules: RuleSettings;
}

export interface Violation {
  ruleId: RuleId;
  message: string;
  line: number;
  column: number;
  severity: Severity;
}

export interface Subject {
  text: string;
  label: string;
}

export interface CheckResult {
  violations: Violation[];
  hard: Violation[];
  soft: Violation[];
  reason: string | undefined;
}

export function ruleNames(): RuleId[];
export function newEngine(config?: Config): Engine;
export function replyFaults(handle: Engine, subject: Subject): Violation[];
export function promptText(handle?: Engine): string;
export function lint(handle: Engine, text: string): Violation[];
export function format(violations: readonly Violation[]): string;
export function summarise(violations: readonly Violation[]): { hard: number; soft: number };
export function check(compiled: Engine, subject: Subject): CheckResult;
export function blockReason(label: string, hard: readonly Violation[], tail?: string): string;
export function warnReason(label: string, soft: readonly Violation[]): string;
export function fileSubject(path: string, content: string): Subject | undefined;
export function editSubject(path: string, texts: readonly string[]): Subject | undefined;
export function commitSubject(command: string): Subject | undefined;
export function replySubject(text: string): Subject | undefined;
