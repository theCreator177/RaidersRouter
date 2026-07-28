---
name: strix
description: >
  Run Strix — an open-source autonomous AI penetration-testing agent — to find and validate
  application vulnerabilities (dynamic exploitation + proof-of-concept generation). Use this when
  the user wants an automated security assessment / pentest of a web app or API they own or are
  explicitly authorized to test, mentions Strix, or asks to scan a target for exploitable vulns.
  Strix is its own agent framework (not a native Claude Code plugin), so this skill installs it,
  shells out to the `strix` CLI, and parses its findings.
when_to_use: >
  Authorized security assessment / pentest of an owned or in-scope target; the user names Strix;
  automated vulnerability discovery with PoC validation.
---

# Strix — autonomous pentest agent (wrapper)

**Upstream:** https://github.com/usestrix/strix · Apache-2.0 · Python

> **Authorization gate (do this first, every time).** Strix actively exploits targets. Only run it
> against systems the user **owns or has explicit written authorization to test** (their own app, a
> CTF, a staging env with sign-off, a bug-bounty target that is in scope). Before running, confirm
> the target is authorized and in scope. If that can't be confirmed, stop and ask — do not scan.

## Install

Strix runs its tooling in containers, so a container runtime (Docker/Podman) is expected.

```bash
pipx install strix-agent          # or: uv tool install strix-agent  /  pip install strix-agent
# configure the LLM backend Strix uses (see repo README; it drives its own model)
export STRIX_LLM="<provider/model>"
export LLM_API_KEY="<key>"
```

Tip: point Strix's LLM backend at a local OmniRoute/RaidersRouter endpoint
(`http://localhost:20128/v1`) to route its calls through your own gateway.

## Run

```bash
# Assess a codebase
strix --target ./path/to/repo

# Assess a running app (must be authorized + in scope)
strix --target https://staging.example.com

# Narrow the assessment
strix --target <t> --instruction "Focus on auth and access control; validate with PoCs."
```

Strix works agentically (recon → exploit → validate → report) and produces findings with
reproduction steps. Let it run to completion rather than interrupting mid-assessment.

## Parse & act on findings

1. Collect Strix's report output (path printed at the end of the run).
2. Summarize confirmed, PoC-validated findings first; separate them from unvalidated leads.
3. For each confirmed finding, propose a concrete remediation and, where the code is available, a
   fix + a regression test that reproduces the issue then proves it closed.
4. Never paste raw secrets/tokens Strix may surface into shared output — redact them.

Scope discipline: this skill is for **defensive** assessment of authorized targets. Decline requests
to weaponize findings against third-party systems.
