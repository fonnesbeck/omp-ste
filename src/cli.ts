#!/usr/bin/env bun
import { fileURLToPath } from "node:url";
import { LAUNCH_FLAG_COMMANDS, resolveCliArgv } from "@oh-my-pi/pi-coding-agent/cli-commands";

const args = process.argv.slice(2);
const routed = resolveCliArgv(args);
if ("argv" in routed && LAUNCH_FLAG_COMMANDS[routed.argv[0]]) {
  const separator = args.indexOf("--");
  args.splice(separator < 0 ? args.length : separator, 0,
    "--extension", fileURLToPath(new URL("..", import.meta.url)));
}
const child = Bun.spawn([
  process.execPath,
  fileURLToPath(import.meta.resolve("@oh-my-pi/pi-coding-agent/cli")),
  ...args,
], { stdin: "inherit", stdout: "inherit", stderr: "inherit" });
process.exitCode = await child.exited;
