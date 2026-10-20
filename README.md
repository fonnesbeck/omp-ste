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

Install directly from GitHub. You do not need to clone the repository or install dependencies.

```sh
omp plugin install github:fonnesbeck/omp-ste#main
```

To refresh an existing installation from the current main branch, run:

```sh
omp plugin install github:fonnesbeck/omp-ste#main --force
```

Restart OMP after installation or an update. Enter `/ste status` to check that the plugin loaded.
Checks start enabled in each new session. Strict reply mode starts disabled.

Installation does not change your status-bar settings. By default, OMP shows the STE label below the prompt.
Follow the [Status bar](#status-bar) instructions to move it inside the bar.
A separate label does not mean installation failed.

For local development, you can link an existing checkout instead:

```sh
omp plugin install /absolute/path/to/omp-ste
```

Keep that directory in place. OMP loads the plugin from it, including uncommitted changes.
To return to the GitHub version, use the refresh command above.

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

## Status bar

The status shows the result of the most recent automatic check, not the whole session.

| Display | Meaning |
|---|---|
| `○ STE OPS` | Checks enabled in operational mode, no result yet |
| `○ STE AUTH` | Checks enabled in authored mode, no result yet |
| `◆ STE OPS` or `◆ STE AUTH` | Strict reply checks in the selected mode |
| `✓ STE` | The last check found no violations |
| `× STE: 2 hard / 1 soft` | The last check found hard violations |
| `△ STE: 0 hard / 1 soft` | The last check found warnings only |

`/ste off` removes the status. A check result replaces the mode label without changing the mode.
Use `/ste status` to see the current mode.

OMP normally shows plugin status text below the prompt.
To put it inside the native status bar, use a custom layout with the `status` segment.
Set `statusLine.showHookStatus` to `false` to remove the separate row.

This example keeps the default OMP 18.12 layout and adds status text on the right.
Merge it into your OMP configuration, or add `status` to your existing custom segment list.

```yaml
statusLine:
  preset: custom
  leftSegments: [pi, vim, model, mode, collab, stream, path, git, pr, context_pct, cost]
  rightSegments: [session_name, status]
  separator: powerline-thin
  segmentOptions:
    model: {showThinkingLevel: true}
    path: {abbreviate: true, maxLength: 40, stripWorkPrefix: true}
    git: {showBranch: true, showStaged: true, showUnstaged: true, showUntracked: true}
  showHookStatus: false
```

The native segment uses your OMP theme and includes status text from all plugins.
The plugin does not change your OMP settings or replace its status bar.

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
| `/ste mode operational` | Enable normal checks and clear the authored selection |
| `/ste mode authored [document-path]` | Enable authored output and select one optional local document |

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

### Authored writing mode

Operational mode is the default. It applies STE checks to all supported text.
Authored mode allows an explicit exception for a requested article, tutorial, talk, or other authored piece.

Use authored mode only when the user requests an authored voice.
Document length and prompt text never select the mode automatically.
Do not disable all checks with `/ste off` for authored work.

Enter `/ste mode authored` for marked output only.
Add one document path to allow authored prose in that file.
Each command replaces the previous file selection.

```text
/ste mode authored
/ste mode authored docs/Article Draft.md
/ste status
/ste mode operational
```

The path accepts `.md`, `.mdx`, `.markdown`, `.txt`, and `.rst` files.
Use a relative path, an absolute path, or a path that starts with `~/`.
Spaces are literal, so do not add quotes.

This exception supports local paths only. It compares normalized paths, not symlink targets.
Other files still get the normal checks.

The agent sends the authored piece through `say` with `authored` set to `true`.
Ordinary `say` calls and direct chat still get STE checks.
Authored output outside `say` is not exempt.

```json
{"text": "The bar strip isn't fancy. That's the feature.", "authored": true}
```

In operational mode, the plugin rejects `say` calls marked `authored`.
Existing callers can omit the optional field.
The `ste_lint` tool always checks the text that it receives.

Source comments, commit messages, operational instructions, and status text keep STE checks in authored mode.
Strict reply mode remains independent.
Task mode commands enable checks without changing the strict reply setting.

The command changes checks immediately, and the next prompt gets the new mode instructions.
New sessions and plugin reloads start in operational mode.
The `off` command also clears the authored selection.

Use `/ste mode operational` after the authored task.
Start a new OMP process after you update this plugin.
An existing process can retain old plugin code and instructions.

This mode changes only this plugin's checks and language prompt.
It does not override independent host or developer instructions, permissions, safety rules, or tool checks.
If the host demands STE for every output, its instructions must allow the authored exception before you use this mode.

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

## License

MIT. The original agent-ste checker is by Cameron Austgen. See [LICENSE](LICENSE)
and the licenses under `vendor/agent-ste` for bundled components.
