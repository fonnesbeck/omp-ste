# omp-ste

Writing-quality checks for [omp](https://omp.sh), powered by
[agent-simple-english](https://github.com/jyooi/agent-simple-english).
Checks documentation, code comments, commit messages, and assistant replies.

## Install

Requires [Git](https://git-scm.com) and [Bun 1.3.14 or newer](https://bun.sh).
Use the same commands on Linux, macOS, and Windows:

```sh
git clone https://github.com/fonnesbeck/omp-ste.git
cd omp-ste
bun install --frozen-lockfile
bun link
```

Bun installs the compatible omp runtime and applies its dependency patch
normally. There is no custom installer, manual patch step, or change to your
existing omp executable. Keep the checkout in place.

**Use this installation method rather than `omp plugin install` on stock omp.**
Stock omp lacks the hooks this package needs.

## Use

From your project directory, start:

```sh
omp-ste
```

Or run `bun run omp` from the checkout. Existing omp settings and model
credentials remain in use. Run `/ste status` in the session to confirm that
checks loaded. New sessions start enabled, with non-strict reply feedback.

| Command | Effect |
|---|---|
| `/ste` | Toggle checks |
| `/ste on` | Enable checks |
| `/ste off` | Disable checks and leave strict mode |
| `/ste status` | Show mode and rule status |
| `/ste strict` | Also gate replies before displaying them |
| `/ste strict off` | Return to normal reply feedback |

Modes apply only to the current session. Hard violations block supported file
changes and detected commit messages; soft violations produce warnings. Strict
mode does not turn soft or disabled rules into hard rules.

## Configuration

Global settings: `~/.config/simple-english/config.json`, or
`$XDG_CONFIG_HOME/simple-english/config.json` when XDG is an absolute path.
Project settings: `.simple-english.json` in the session's working directory.
Trusted project settings override global settings.

```json
{
  "maxSentenceWords": 30,
  "rules": {
    "verb-passive": "hard",
    "marketing": "soft"
  }
}
```

Rules accept `hard`, `soft`, or `off`. Restart the session after changing settings.
See the [rule reference](https://github.com/jyooi/agent-simple-english#readme)
for available rules and custom dictionaries.

## Limits

- Shell commands and external programs can bypass the file gate.
- Strict mode controls displayed replies; it does not erase raw session history.
- The bundled dictionary is a sample, not the full official ASD-STE100 dictionary.
  This package does not certify compliance.

MIT. Attribution notices are in [LICENSE](LICENSE).
