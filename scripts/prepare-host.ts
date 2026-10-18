import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const hostRoot = process.argv[2]
  ? resolve(process.argv[2])
  : resolve(dirname(fileURLToPath(import.meta.resolve("@oh-my-pi/pi-coding-agent"))), "..");
const manifest = await Bun.file(resolve(hostRoot, "package.json")).json();
if (manifest.name !== "@oh-my-pi/pi-coding-agent") {
  throw new Error(`Not an omp source package: ${hostRoot}`);
}
const patchPath = fileURLToPath(new URL(`../host-patches/${manifest.version}.patch`, import.meta.url));
if (!(await Bun.file(patchPath).exists())) {
  throw new Error(`No verified host patch for omp ${manifest.version}. Supported versions: 18.11.0, 18.12.0, and 18.12.1.`);
}

async function patch(args: string[]) {
  const child = Bun.spawn(["patch", "--batch", "--force", "-p1", "--directory", hostRoot, "--input", patchPath, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { exitCode, output: stdout + stderr };
}

const applied = await patch(["--reverse", "--dry-run"]);
if (applied.exitCode === 0) {
  console.log(`omp ${manifest.version} enforcement hooks are already installed.`);
} else {
  const preflight = await patch(["--forward", "--dry-run"]);
  if (preflight.exitCode !== 0) {
    throw new Error(`The host source does not match the supported patch. No files were changed.\n${preflight.output}`);
  }
  const result = await patch(["--forward"]);
  if (result.exitCode !== 0) throw new Error(`Host patch failed:\n${result.output}`);
  console.log(`Installed omp ${manifest.version} enforcement hooks in ${hostRoot}.`);
}
