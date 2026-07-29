---
name: jcode
description: >
  Install and drive jcode — a fast Rust coding-agent harness that runs single-shot,
  non-interactive tasks via `jcode run` with JSON/NDJSON output, speaks ~45 model providers
  (including openai-compatible, ollama, lmstudio and kimi), and can be pointed at a local
  gateway such as OmniRoute. Use this when the user wants a lightweight local coding agent,
  wants to delegate a bounded subtask to a separate agent process, wants a scriptable agent
  they can pipe JSON out of, is on a low-memory machine, or mentions jcode.
when_to_use: >
  User names jcode; wants a scriptable/headless coding agent; wants to delegate a self-contained
  subtask to a separate agent binary; wants an agent that routes through a local OpenAI-compatible
  gateway; wants a low-memory harness.
---

# jcode — fast Rust coding-agent harness

**Upstream:** https://github.com/1jehuang/jcode · MIT · Rust · default branch `master`
**Tagline:** "A coding agent using Claude Max or ChatGPT Pro subscriptions"

Everything below marked *verified* was measured against **v0.61.1** on Linux x86_64, not quoted
from the README.

## Install

```bash
# macOS / Linux
curl -fsSL https://jcode.sh/install | bash

# Windows 11 (PowerShell 5.1+)
irm https://jcode.sh/install.ps1 | iex

# Homebrew
brew tap 1jehuang/jcode && brew install jcode

# From source
git clone https://github.com/1jehuang/jcode && cd jcode && cargo build --release
```

*Verified* about the shell installer:

- **No `sudo`** — installs to `~/.local/bin` (override with `JCODE_INSTALL_DIR`); on Windows,
  `%LOCALAPPDATA%\jcode\bin`, added to the user PATH.
- **SHA-256 verified** — it refuses to install if it can't find a trusted checksum.
- Contacts three hosts: `github.com` (binary), `jcode.sh/releases` (metadata),
  `telemetry.jcode.sh` (see below).
- Appends a PATH line to your shell rc file idempotently, and skips it if the dir is already on PATH.
- Disk: ~138 MB installed.

### Two defaults worth changing

**Telemetry is ON by default.** It reports install count, version, OS, session activity, tool
counts, and crash/exit reasons — the project states no code, filenames, or prompts are sent.
Opt out:

```bash
export JCODE_NO_TELEMETRY=1     # or the standard DO_NOT_TRACK=1
```

Set it before running the installer if you want the install event suppressed too.

**Auto-update is ON by default** for release builds. Pass `--no-update` per invocation, which
matters when you want a reproducible agent version in a script or CI job.

## Command surface

jcode is **not** interactive-only — this is what makes it usable from another agent:

| Command | Purpose |
| --- | --- |
| `jcode run <MESSAGE>` | **Single message, then exit.** The delegation path. |
| `jcode repl` | Simple REPL, no TUI |
| `jcode serve` | Background agent daemon |
| `jcode server` | Manage the daemon (`jcode server stop`) |
| `jcode connect` | Connect to a running server |
| `jcode acp` | Agent Client Protocol adapter backed by the daemon |
| `jcode login [provider]` | OAuth, API key, or local credentials |

Useful `run` flags: `--json` (machine-readable result), `--ndjson` (streaming events),
`-C/--cwd` (working directory), `-p/--provider`, `--no-update`.

## Delegating work to it

Because `jcode run` is single-shot and can emit JSON, delegation is genuinely practical:

```bash
# Bounded subtask in its own directory, machine-readable result
jcode run "Add a --dry-run flag to scripts/deploy.sh and update its --help" \
  --cwd /path/to/repo --json --no-update

# Stream events instead of waiting
jcode run "Explain the retry logic in src/retry.rs" --ndjson
```

Give it a **fully specified, self-contained** job in its own working directory, then review the
diff before anything is committed — treat its output like an untrusted contributor's PR.

Worth being honest about the tradeoff: jcode is itself an agent harness, so running it from
inside another agent means two models on one task. That's justified for genuinely parallel or
isolated subtasks, for benchmarking, or when you specifically want jcode's provider routing —
and not justified for work the current session can simply do itself.

## Provider routing (~45 providers)

`jcode login <provider>` / `jcode run -p <provider>` supports OAuth subscriptions (Claude Max,
ChatGPT Pro), direct API keys, and local runtimes. Notable entries: `claude`, `anthropic-api`,
`openai`, `gemini`, `kimi`, `moonshot-ai`, `deepseek`, `groq`, `mistral`, `xai`, `openrouter`,
`bedrock`, `azure`, `ollama`, `lmstudio`, `openai-compatible`, `copilot`, `cursor`.

**Point it at your own gateway.** Since `openai-compatible` is supported, jcode can route
through a local OmniRoute/RaidersRouter instance so its traffic gets the same fallback,
quota-awareness, and logging as everything else:

```bash
jcode login openai-compatible     # base URL: http://localhost:20128/v1
jcode run "…" -p openai-compatible
```

## Measured facts (v0.61.1, Linux x86_64)

| Metric | Measured | Note |
| --- | --- | --- |
| Peak RSS (`jcode --version`) | **23.4 MB** | README claims ~27.8 MB baseline; measured lower |
| Binary | ~505 MB apparent (sparse) | on-disk install ~138 MB |
| Install total | 138 MB | `~/.jcode` + launcher symlink |

Measure on your own hardware before quoting numbers — startup RSS varies by platform and
build. For a real comparison use `hyperfine` for time and `/usr/bin/time -v` (or
`resource.getrusage`) for peak memory, on the same task.

## Structural notes

- Its skills namespace is `.jcode/skills/` — **not** interoperable with Claude Code's
  `.claude/skills/`. A skill written for one is not loaded by the other.
- `.claude/mcp.json` in the jcode repo is jcode's *consumer-side* MCP client config; jcode
  consumes MCP servers and does not expose one.
- It ships its own `AGENTS.md` convention.
- `jcode acp` speaks the Agent Client Protocol, so it can slot into ACP-aware editors.
