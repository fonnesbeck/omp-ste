# omp-ste

A self-contained port of [agent-ste](https://pi.dev/packages/agent-ste) for
[omp](https://omp.sh). It checks documentation, code comments, shell message
arguments, and assistant replies against Simplified Technical English rules.

This is an **omp plugin**, not an agent launcher. It uses stock extension APIs.
There is no bundled omp runtime, host patch, service, network call, or runtime
package dependency. The compiled agent-ste 0.5.2 engine ships with the plugin.

## Install

With stock omp installed:

```sh
git clone https://github.com/fonnesbeck/omp-ste.git
omp plugin install ./omp-ste
```

The local install links the checkout. Keep it in place. No `bun install`, build,
or `bun link` is needed to use the plugin. Start `omp` as usual, then run
`/ste status`. New sessions start with checks enabled and strict mode off.

For one session without installation:

```sh
omp --extension /absolute/path/to/omp-ste
```

Verified with the stock 18.12.1 SDK and the unmodified omp 18.12.2 executable.

## What runs

1. The active rule list enters the model's system prompt.
2. A hard fault blocks a supported tool call **before execution** and gives the
   model a line, column, rule ID, and correction. Soft faults warn without
   blocking and appear in the tool result.
3. Assistant replies stay unchanged. Faults feed back into the model's context:
   during a tool-using run, or at the next user prompt for a final reply.
   Same-run feedback is capped at three notes to avoid a correction loop.

| Surface | Checked text |
|---|---|
| `write` | Prose files and source comments, selected by file extension |
| `edit` | Newly supplied text in hashline, replace, patch, apply-patch, and sloppy modes |
| `bash` | Prose in `-m` and `--message` arguments, including commit messages |
| `say` | The proposed reply |
| Assistant messages | Text blocks, not thinking or tool arguments |

Markdown code fences and inline code are excluded. Source identifiers and string
values are not prose. Unsupported file types are left alone. The linter reports
faults; it never rewrites text.

Two tools are available to the model:

- `ste_lint`: check a draft and return structured violations. Available even
  when automatic enforcement is off.
- `say`: return the supplied reply unchanged if it passes the enabled checks.

## Session controls

| Command | Effect |
|---|---|
| `/ste` | Toggle automatic checks |
| `/ste on` | Enable checks |
| `/ste off` | Disable checks and leave strict mode |
| `/ste status` | Show the mode, severity overrides, and any config error |
| `/ste strict` or `/ste strict on` | Instruct the model to send every reply through `say` |
| `/ste strict off` | Return to ordinary reply feedback |

Strict mode follows the upstream pi design: the tool call is the enforcement
point. A hard fault blocks `say`; a soft fault does not. **Direct assistant text
is not blocked or retracted.** The model must follow the instruction to use
`say`. Tool arguments can also appear in logs or client displays. Strict mode is
not an output filter or a confidentiality boundary.

## Configuration

Use the upstream `.ste.json` format:

```json
{
  "rules": {
    "verb/passive": "off",
    "style/marketing": "hard",
    "length/paragraph": "soft"
  }
}
```

Global defaults come from `STE_CONFIG`, if set. Otherwise they come from
`$XDG_CONFIG_HOME/ste/config.json`, or `~/.config/ste/config.json` when XDG is
absent or relative. The nearest `.ste.json`, searched upward from the session's
working directory, overrides each rule it names and keeps the other defaults.

Rules accept `hard`, `soft`, or `off`. An off rule also leaves the model's rule
list. An all-soft configuration blocks no writes but still reports reply faults.
Unknown keys, rule IDs, or severities are errors. An explicitly named missing
`STE_CONFIG` file is also an error. Like the upstream pi extension, this plugin
warns about a config error and uses built-in severities. It does not silently
accept the invalid settings. Start a new session after changing configuration.

Rule IDs: `dictionary/not-approved-word`, `length/sentence`,
`length/paragraph`, `verb/progressive`, `verb/perfect`, `verb/passive`,
`style/contraction`, `style/semicolon`, `style/phrasal-verb`, `style/hedge`,
`style/marketing`, and `suppress/invalid-directive`. See the
[upstream rule reference](https://github.com/ctotheameron/agent-ste#what-it-checks)
for defaults and examples.

Suppress a rule on the next line with the file's comment syntax:

```markdown
<!-- ste-disable-next-line style/marketing -->
The robust estimator fits this sample.
```

A missing or unknown rule ID reports `suppress/invalid-directive`.

## Scope and migration

- Shell redirection, external programs, and other mutation tools can bypass the
  file checks. This is a writing aid, not a filesystem security policy.
- Edit checks read supplied additions, not reconstructed files. They do not
  recheck old prose or recover syntax from surrounding, unchanged code. Cut/paste
  registers and non-file destinations without a recognizable extension are not
  a full-file enforcement boundary.
- Comment extraction is heuristic. These checks do not certify ASD-STE100
  compliance or include the full official dictionary.
- This replaces the earlier `omp-ste` launcher and host-patch design. Launch
  `omp`, not `omp-ste`. Replace `.simple-english.json` with `.ste.json` and use
  the upstream slash-separated rule IDs. Old engine settings are not read.

## Development and upstream source

```sh
pixi run install
pixi run check
pixi run test
```

The host SDK is a development dependency only. Tests exercise the real stock
host tool pipeline with a local scripted model, without provider credentials.

`src/index.ts` owns the extension lifecycle. `src/subjects.ts` maps omp tool
inputs to lint subjects. `src/engine.ts` exposes the bundled upstream engine.
The release URL, archive integrity, licenses, and local changes are recorded in
[`vendor/agent-ste/package.json`](vendor/agent-ste/package.json).

The bundled source has one correction to upstream 0.5.2: the comment scanner
enters template-literal state only at a backtick transition. The upstream code
otherwise skips later line comments after an ordinary first line. A regression
test covers comments after code. No omp code is modified.

MIT. The upstream engine is by Cameron Austgen. See [LICENSE](LICENSE) and the
licenses under `vendor/agent-ste` for bundled components.
