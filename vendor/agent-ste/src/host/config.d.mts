// Local declarations for the unchanged agent-ste 0.5.2 config loader.
import type { Config, RuleSettings } from "./lint.mjs";

export interface LoadedConfig extends Config {
  rules: RuleSettings;
  paths: string[];
  path: string | undefined;
}

export const CONFIG_NAME: ".ste.json";
export class ConfigError extends Error {}
export function globalPath(): { path: string; named: boolean };
export function findConfig(from: string): string | undefined;
export function readConfig(path: string, names: readonly string[]): { rules: RuleSettings; path: string };
export function loadConfig(from: string, names: readonly string[]): LoadedConfig;
