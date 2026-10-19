# omp-ste

`omp-ste` checks the English that [omp](https://omp.sh) writes in documents,
code comments, commit messages, and replies. It adapts
[agent-ste](https://pi.dev/packages/agent-ste) for omp.

It works with an ordinary omp installation. It needs no patched runtime,
separate launcher, build step, or extra packages.

## What it does

Suppose the agent tries to write this sentence to a Markdown file:

```text
Utilize the file.
```

The plugin blocks the write and tells the agent:

```text
Use "use", not "utilize".
```

The agent can then submit a revised sentence:

```text
Use the file.
```

That sentence passes. The plugin checks text but never rewrites it itself.

The checks come from Simplified Technical English (STE), a controlled writing
standard for technical documentation. Its rules cover word choice, sentence
length, verb forms, and punctuation.

Strict STE compliance is not the same as clear everyday English. For example,
the default rules reject contractions, although contractions can be clear.
You can disable individual rules without disabling the other checks.

## Install

With omp installed, run:

```sh
git clone https://github.com/fonnesbeck/omp-ste.git
omp plugin install ./omp-ste
```

The install links to this directory, so keep the directory in place.
You do not need to run `bun install` or `bun link`.

Start `omp` as usual, then enter `/ste status` to check that the plugin loaded.
Checks start enabled in each new session. Strict reply mode starts disabled.

To try the plugin for one session without installing it:

```sh
omp --extension /absolute/path/to/omp-ste
```

Verified with the unmodified omp 18.12.2 executable and the stock 18.12.1 SDK.

## What gets checked

| When the agent… | The plugin checks… |
|---|---|
| Writes a document | Text in Markdown, plain-text, and reStructuredText files |
| Writes source code | Comments in supported languages, including Python, JavaScript, TypeScript, Go, and Rust |
| Edits a file | The new text in the edit, not the existing file contents |
| Runs a command with `-m` or `--message` | The message text, such as a Git commit message |
| Replies to you | The reply text, after the agent sends it |

Code examples inside Markdown are excluded. In source files, checks target
comments rather than variable names or string values. Other file types are
ignored.

The plugin distinguishes two kinds of violation:

- **Hard:** blocks a checked write, edit, message command, or `say` call.
  The agent receives the rule name, text position, and suggested correction.
- **Soft:** shows a warning but lets the action continue.

Ordinary chat replies work differently. You see the original reply, and the
agent receives feedback to help it write its next reply. The plugin does not
hide or replace text that you already saw.

If the agent continues working, it can receive feedback during the same task.
Otherwise, it receives the feedback with your next prompt. Feedback during a
task is limited to three notices to avoid repeated correction requests.

## Session commands

Enter these commands in omp:

| Command | What it does |
|---|---|
| `/ste` | Switch checks on or off |
| `/ste on` | Enable checks |
| `/ste off` | Disable checks, including strict reply mode |
| `/ste status` | Show the current mode, custom rule settings, and configuration errors |
| `/ste strict` or `/ste strict on` | Enable checks and ask the agent to submit replies through `say` |
| `/ste strict off` | Stop asking for replies through `say`, without disabling other checks |

### Strict mode checks replies before sending them

The plugin gives the agent a tool named `say`. The agent submits a proposed
reply to this tool. A hard violation blocks the call and asks for a correction.
An accepted call returns the reply unchanged.

Strict mode tells the agent to use `say` for every reply. It cannot force the
agent to comply. If the agent writes directly in chat instead, that text still
appears.

Text submitted to tools can also appear in logs or other displays, even when
the call is blocked. Strict mode is not a way to keep rejected text secret.

The agent also gets `ste_lint`, a tool for checking a draft without sending it
or writing a file. This tool remains available when automatic checks are off.
You do not need to call either tool yourself.

## Choose which rules to enforce

Create `.ste.json` in your project directory. For example, this configuration
allows contractions and sets passive-voice reports to warnings:

```json
{
  "rules": {
    "style/contraction": "off",
    "verb/passive": "soft"
  }
}
```

Each rule accepts one of these settings:

| Setting | Effect |
|---|---|
| `hard` | Block checked tool calls that break this rule |
| `soft` | Report the problem without blocking the call |
| `off` | Do not check this rule or include it in the agent's writing instructions |

For ordinary chat replies, both `hard` and `soft` produce feedback rather than
blocking the reply. Use `off` to stop that feedback for a rule.

See the [agent-ste rule reference](https://github.com/ctotheameron/agent-ste#what-it-checks)
for rule names, default settings, and examples. Start a new session after
changing your configuration.

### Machine-wide settings and project settings

The plugin first reads machine-wide defaults:

- If `STE_CONFIG` is set, it reads the file named by that environment variable.
- Otherwise, it reads `$XDG_CONFIG_HOME/ste/config.json`.
- If `XDG_CONFIG_HOME` is absent or relative, it uses `~/.config/ste/config.json` instead.

It then searches for `.ste.json`, starting in the session's working directory
and moving through parent directories. It uses the first file it finds.
Project settings replace only the rules they name. Other rules keep their
machine-wide or built-in defaults.

Unknown settings, invalid rule names, and invalid rule values cause a
configuration error. A missing file explicitly named by `STE_CONFIG` also
causes an error. The plugin reports the error and uses its built-in defaults,
as the original pi extension does.

### Make an exception for one line

Sometimes a word is correct in its technical context. Add a comment naming the
rule to skip on the next line:

```markdown
<!-- ste-disable-next-line style/marketing -->
The robust estimator fits this sample.
```

In source code, use the language's comment syntax, such as `//` or `#`.
The exception applies to one line only. An unknown or missing rule name causes
an error rather than silently disabling checks.

## Limits

- The plugin checks omp's `write` and `edit` tools. Shell commands, external
  programs, and other tools can change files without these checks.
- An edit check sees only the new text. It can miss a problem that depends on
  surrounding text, such as a comment that starts outside the edited section.
- Moving existing text does not trigger a complete review of that text.
  Special destinations without a recognizable file extension can escape checks.
- The comment reader uses text patterns, not a complete parser for each language.
  It can mistake code for comments or miss some comments.
- Passing these checks does not certify ASD-STE100 compliance. The plugin does
  not include the full official dictionary.

## Switching from the old implementation

Start `omp`, not the old `omp-ste` launcher. This version needs no host patches.

Replace `.simple-english.json` with `.ste.json`. Use the rule names from
agent-ste, such as `style/contraction`. The old configuration format is no
longer read.

## Development

These commands install development dependencies and run the checks:

```sh
pixi run install
pixi run check
pixi run test
```

The omp SDK is needed only for development. Tests use real omp tools and a
scripted model, without credentials for an AI provider.

- `src/index.ts` registers the plugin's tools, commands, and event handlers.
- `src/subjects.ts` selects the text to check from omp tool calls.
- `src/engine.ts` provides access to the bundled agent-ste 0.5.2 checker.

The bundled checker includes one bug fix: it correctly reads line comments
after a line of code. The original scanner could skip those comments.
A regression test covers this case. No omp code is changed.

Source versions, checksums, licenses, and local changes are recorded in
[`vendor/agent-ste/package.json`](vendor/agent-ste/package.json).

MIT. The original agent-ste checker is by Cameron Austgen. See [LICENSE](LICENSE)
and the licenses under `vendor/agent-ste` for bundled components.
