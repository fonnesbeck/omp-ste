# omp-ste

Simplified Technical English enforcement for [omp](https://omp.sh), using the
[agent-simple-english 0.8.0](https://github.com/jyooi/agent-simple-english) lint engine.
It reports deterministic writing problems. It does not rewrite text automatically.

The package starts enabled, with non-strict reply feedback. It provides:

- Active writing rules in the model's system prompt.
- Pre-write checks for native `write` and `edit` tools. Hard violations block the
  affected write. Soft violations allow it and return warnings to the model.
- Checks for new edit violations, so existing prose does not block an unrelated edit.
- A gate for static messages in detected `bash` `git commit -m` and `--message`
  commands. Conventional Commit prefixes and final trailers are excluded.
  Detected commits without a checkable static message are blocked.
- Final-reply checks, a TUI hard/soft count widget, and hard-violation feedback
  delivered once at the next model call.
- Optional strict replies through `say`. Rejected text stays hidden from live
  output. An approved `say` result ends the turn without another model call.

## A patched omp host is required

Stock omp 18.11.0, 18.12.0, and 18.12.1 do not expose the native edit pre-write
boundary or an output filter that runs before UI/RPC delivery. This repository
supplies version-specific companion patches for all three releases. It does not
patch runner prototypes or replace the native edit implementation.

The extension refuses to load without the required APIs. omp can continue after
an extension-load error, so a stock `omp -e .` is **not** an enforced session.
Use the launcher below, or a host with the companion changes.

## Install for omp

On an omp host with the required companion hooks, install directly from GitHub:

```bash
omp plugin install github:fonnesbeck/omp-ste
omp plugin list
omp
```

The install is user-wide by default. No manual clone, Pixi environment, npm
publication, or `plugin link` is needed to install the extension. The package's
`omp.extensions` manifest lets omp discover and load it in new sessions.

In the new session, run `/ste status` to check that the engine loaded.
Checks start enabled/non-strict; `/ste strict` also gates replies. Your existing
global writing-rule configuration still applies: only `hard` rules block
changes, and strict mode does not promote `soft` or `off` rules.

**Host prerequisite:** this command installs the extension, not the companion
host patch. An unmodified standalone omp binary lacks the required hooks;
installing a plugin cannot add them to that executable. Use an already-patched
global omp, or the source-host setup below. After an omp upgrade, reapply the
matching host patch before starting enforced sessions.

The package is not published to npm, so use the `github:` source above rather
than `omp plugin install omp-ste`.

### Run from this checkout

Install [Pixi](https://pixi.sh), then run:

```bash
pixi install
pixi run install
pixi run omp
```

The launcher applies the patch to the locally installed development SDK and runs
its source CLI with this extension. Your globally installed `omp` binary and
plugin settings are unchanged. Additional CLI arguments are supported:

```bash
pixi run omp --model opus
```

The environment supplies Bun and GNU patch. Without Pixi, use Bun 1.3.14 or newer
and GNU patch:

```bash
bun install --backend=copyfile
bun run omp
```

To use a separate installed source package, run its patched source entry point:

```bash
host_root=/path/to/node_modules/@oh-my-pi/pi-coding-agent
package_root=/absolute/path/to/omp-ste
bun "$package_root/scripts/prepare-host.ts" "$host_root"
bun "$host_root/src/cli.ts" --extension "$package_root"
```

Use `pixi run bun` instead of `bun` when using this checkout's environment.
These patches do not rebuild `dist/cli.js` or a standalone `omp` binary.
Running the ordinary installed `omp` command does not use patched source merely
because its source package was patched.

The installer checks the exact host version and preflights the patch before
changing files. Repeating it is safe. Other host versions require a verified
patch or equivalent upstream APIs; compatibility is not assumed.

### Load it as an omp package

For persistent plugin discovery, use that same source CLI to link the package
and start later sessions without an explicit extension argument:

```bash
bun "$host_root/src/cli.ts" plugin link "$package_root"
bun "$host_root/src/cli.ts"
```

`package.json` declares `omp.extensions`. The npm tarball includes the extension,
engine dependency declarations, host patches, patch installer, and license.
No publication or global installation is part of the development setup.

## Session commands

| Command | Effect |
| --- | --- |
| `/ste` | Toggle enforcement. Disabling also leaves strict mode. |
| `/ste on` | Enable checks; leave the strict setting unchanged. |
| `/ste off` | Disable all checks and leave strict mode. |
| `/ste status` | Show mode, rule counts, and dictionary/load state. |
| `/ste strict` or `/ste strict on` | Enable all checks and strict replies. |
| `/ste strict off` | Leave strict mode without changing enforcement. |

Arguments support autocomplete. Modes are local to the session and are not
written to a global configuration file. New sessions start enabled/non-strict.
The `say` tool is active only in strict mode; do not exclude it through an
explicit tool allowlist when using strict mode.

## Configuration and dictionaries

Configuration uses the upstream schema and these paths only:

1. `$XDG_CONFIG_HOME/simple-english/config.json`, or
   `~/.config/simple-english/config.json` when XDG is unset or relative.
2. `.simple-english.json` in the session working directory.

Project settings override global settings. `rules` and `ruleDataExtensions`
merge by key. Legacy `.pi` files and the pi agent configuration directory are
not consulted. Configuration loads at session startup and switching. Restart the
session after changing configuration or dictionary files.

For example:

```json
{
  "maxSentenceWords": 30,
  "rules": {
    "verb-passive": "hard",
    "marketing": "off"
  }
}
```

The upstream defaults include a 25-word sentence limit, STE-derived rules,
directive validation, and soft hedging/marketing house-style rules. Each rule
accepts `hard`, `soft`, or `off`. The upstream engine also supplies Markdown/code
exemptions, source-comment and HTML extraction, and `ste-disable-next-line`
suppressions. See the [upstream rule and content-kind reference](https://github.com/jyooi/agent-simple-english#readme).

Use `approvedWordsPath` for your own approved-word list, `ruleDataExtensions` for
additional rule data, and `SIMPLE_ENGLISH_DICTIONARY` to replace the bundled
not-approved sample. Relative dictionary and rule-data paths resolve from the
session working directory. A configured approved-word list takes precedence over
the environment replacement. Invalid configuration, dictionaries, or rule data
make enabled file, commit, and strict-reply gates fail closed. `/ste off` disables
those gates if you need to repair the configuration.

The bundled data is a sample, not the complete official ASD-STE100 dictionary.
This package does not include the official specification and does not certify
ASD-STE100 compliance. Keep licensed approved-word lists private unless their
license permits redistribution.

## Enforcement boundaries

- The file gate checks complete proposed text before persistence, including
  native edits, reconstructed conflict resolutions, and SSH writes. Conflict
  resolutions check only new violations against the original complete file.
  Native LSP formatting and ACP bridge behavior remain unchanged. Multi-file
  operations retain omp's existing partial-application semantics.
- The commit gate uses upstream static-command detection. It is not a shell
  sandbox. Arbitrary writes through `bash`, `eval`, external programs, and other
  tools are outside this package's enforcement boundary.
- Normal replies are visible unchanged. Feedback is not a hidden rewrite pass.
- Strict mode filters live TUI, print, JSON, and RPC output, including the tree
  selector and transcript projections. Native provider replay payloads and raw
  `say` invocation metadata are omitted from display copies. Raw proposals can
  remain in stored session history and model context. This is not transcript
  redaction or a secret-storage mechanism.
- Strict mode suppresses ordinary assistant prose outside `say` and asks the model
  to submit a checked reply. It never falls back to displaying a hard violation.

## Development

```bash
pixi run install
pixi run host-patch
pixi run check
pixi run test
npm pack --dry-run
```

The host patch adds session-scoped `registerFileWriteGuard` and
`registerOutputFilter` APIs. Guards receive the authoritative proposed file text
and can reject before mutation. Output filters receive detached display events;
exceptions suppress output rather than revealing the original. Trusted tool
results can use `ExtensionReplyDetails`: `displayAsReply` enables print delivery
with or without output filters, and `terminateTurn` settles a successful reply
through omp's existing graceful terminal-result path in both loop and direct
dispatch. Neither display filtering nor those flags rewrite stored history.

The engine is pinned because the adapter imports its shipped source modules,
which are not a separately versioned public API. Update that dependency only
with compatibility checks. Tests cover modern-only configuration, load failures,
native handler-write gates, strict metadata filtering, detached tree projections,
direct-dispatch termination, and explicit print replies without filters.

## License and attribution

MIT. The engine and dictionaries come from JIA YI's `agent-simple-english`; its
package retains its own third-party dictionary notices. The companion host
patches modify omp code by Mario Zechner, Can Bölük, and Stencil Labs, Inc.
Their copyright notices are retained in [LICENSE](LICENSE).
