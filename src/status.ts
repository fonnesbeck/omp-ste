import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

export async function configureStatusBar(pi: ExtensionAPI, cwd: string): Promise<void> {
  const settings = pi.pi.settings;
  const prefix = settings.getConfigFiles().flatMap(path => ["--config", path]);
  async function config(...args: string[]): Promise<unknown> {
    const child = Bun.spawn(["omp", ...prefix, "config", ...args, "--json"], {
      cwd,
      env: { ...process.env, PI_CODING_AGENT_DIR: settings.getAgentDir() },
      stdout: "pipe", stderr: "pipe",
    });
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
    ]);
    if (code !== 0) throw new Error(stderr.trim() || stdout.trim() || `omp config exited with code ${code}`);
    return stdout.trim() ? JSON.parse(stdout) : undefined;
  }
  async function get(key: string): Promise<unknown> {
    const result = await config("get", `statusLine.${key}`);
    if (result === null || typeof result !== "object" || !("value" in result)) {
      throw new Error(`OMP returned no value for statusLine.${key}`);
    }
    return result.value;
  }
  const [name, left, right, separator, options, below] = await Promise.all(
    ["preset", "leftSegments", "rightSegments", "separator", "segmentOptions", "showHookStatus"].map(get),
  );
  if (typeof name !== "string" || !Object.hasOwn(pi.pi.STATUS_LINE_PRESETS, name)) {
    throw new Error("OMP returned an unknown status bar preset");
  }
  // The stock preset registry validates the key above.
  const preset = pi.pi.getPreset(name as keyof typeof pi.pi.STATUS_LINE_PRESETS);
  const leftSegments = name === "custom" ? left : preset.leftSegments;
  const rightSegments = name === "custom" ? right : preset.rightSegments;
  if (!Array.isArray(leftSegments) || !Array.isArray(rightSegments) ||
      !leftSegments.every(value => typeof value === "string") || !rightSegments.every(value => typeof value === "string")) {
    throw new Error("OMP returned invalid status bar segments");
  }
  const hasStatus = leftSegments.includes("status") || rightSegments.includes("status");
  if (name === "custom" && hasStatus && below === false) return;
  const changes: Record<string, unknown> = {};
  if (name !== "custom") {
    changes.leftSegments = leftSegments;
    changes.separator = separator ?? preset.separator;
    const mergedOptions: Record<string, unknown> = { ...preset.segmentOptions };
    if (options && typeof options === "object") {
      for (const [segment, value] of Object.entries(options)) {
        const base = mergedOptions[segment];
        if (value && typeof value === "object") {
          mergedOptions[segment] = { ...(base && typeof base === "object" ? base : {}), ...value };
        }
      }
    }
    changes.segmentOptions = mergedOptions;
  }
  if (!hasStatus || name !== "custom") changes.rightSegments = hasStatus ? rightSegments : [...rightSegments, "status"];
  if (name !== "custom") changes.preset = "custom";
  changes.showHookStatus = false;
  for (const [key, value] of Object.entries(changes)) {
    await config("set", `statusLine.${key}`, JSON.stringify(value));
  }
  await settings.reloadFromDisk();
}
