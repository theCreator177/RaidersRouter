---
name: jcode
description: >
  Install and delegate work to jcode — a RAM-efficient standalone AI coding-agent harness written
  in Rust (~28 MB baseline RSS, ~14 ms time-to-first-frame). Use this when the user wants a
  lightweight local coding agent, is working on a constrained/low-memory machine, asks to run or
  benchmark jcode, or wants to hand a bounded subtask to a separate agent process.
when_to_use: >
  User names jcode; wants a low-memory local coding harness; wants to benchmark agent harnesses;
  wants to delegate a self-contained subtask to a separate agent binary.
---

# jcode — lightweight Rust coding-agent harness (wrapper)

**Upstream:** https://github.com/1jehuang/jcode · MIT · Rust · default branch `master`

> **Read this first.** jcode is *itself* an agent harness — a peer/competitor to Claude Code, not a
> plugin for it. Running it from inside Claude Code means one agent driving another, which burns
> tokens twice and splits context. Use it deliberately: for benchmarking, for genuinely detached
> subtasks, or when the user specifically wants jcode. For normal coding work in this session, just
> do the work directly — that is strictly better.

## Install

```bash
# macOS / Linux
curl -fsSL https://jcode.sh/install | bash

# Homebrew
brew tap 1jehuang/jcode && brew install jcode

# Windows (PowerShell)
irm https://jcode.sh/install.ps1 | iex

# From source
git clone https://github.com/1jehuang/jcode && cd jcode && cargo build --release
```

Verify with `jcode --version`.

## Notes on structure

- Its own skills namespace lives at `.jcode/skills/` — **not** interoperable with Claude Code's
  `.claude/skills/`. A skill written for one is not loaded by the other.
- `.claude/mcp.json` in the jcode repo is jcode's *consumer-side* MCP client config (it consumes MCP
  servers); jcode does not expose an MCP server.
- It ships its own `AGENTS.md` convention.

## Sensible uses

- **Benchmarking:** compare startup/RSS against other harnesses on the same task, and report numbers
  you actually measured (`/usr/bin/time -v`, `hyperfine`) rather than quoting the README's claims.
- **Detached subtask:** hand jcode a fully self-contained, well-specified job in its own working
  directory, then review its diff before anything is committed.
- **Low-memory host:** recommend it when the user's machine can't comfortably run a heavier harness.

Always review any code jcode produces before committing — treat it as an untrusted contributor's PR.
