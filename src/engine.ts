import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { globalConfigPath, projectConfigPath } from "agent-simple-english/src/config/load.ts";
import { mergeConfigs } from "agent-simple-english/src/config/merge.ts";
import { decodeConfig, type SteConfig } from "agent-simple-english/src/config/schema.ts";
import { loadConfiguredDictionary } from "agent-simple-english/src/dictionary/configured.ts";
import { loadRuleData } from "agent-simple-english/src/dictionary/load.ts";
import type { DictionaryData } from "agent-simple-english/src/dictionary/schema.ts";
import type { RuleData } from "agent-simple-english/src/dictionary/rule-data.ts";
import type { Tagger } from "agent-simple-english/src/engine/tagger.ts";
import { makeWinkTagger } from "agent-simple-english/src/tagger/wink.ts";
import { Effect } from "effect";

export interface Engine {
  config: SteConfig;
  dictionary: DictionaryData;
  ruleData: RuleData;
  tagger: Tagger;
}

let tagger: Tagger | undefined;

async function readConfig(path: string): Promise<SteConfig> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return {};
    throw error;
  }
  return Effect.runPromise(decodeConfig(JSON.parse(text), path));
}

export async function loadEngine(cwd: string, includeProjectConfig = true): Promise<Engine> {
  const global = await readConfig(globalConfigPath());
  const config = mergeConfigs(
    global,
    includeProjectConfig ? await readConfig(projectConfigPath(cwd)) : {},
  );
  const replacement = process.env.SIMPLE_ENGLISH_DICTIONARY;
  const [dictionary, ruleData] = await Promise.all([
    Effect.runPromise(loadConfiguredDictionary(config, cwd, replacement === undefined ? undefined : resolve(cwd, replacement))),
    Effect.runPromise(loadRuleData(config.ruleDataExtensions, cwd)),
  ]);
  tagger ??= makeWinkTagger();
  return { config, dictionary, ruleData, tagger };
}
