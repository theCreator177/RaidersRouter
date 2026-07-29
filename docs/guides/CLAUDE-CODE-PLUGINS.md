# Claude Code Plugins & Skills

RaidersRouter doubles as a **Claude Code marketplace**. This guide covers what it bundles, how to
install it, and — importantly — *why some of the source repos are wrapped rather than installed
directly*.

> **Terminology warning.** This repo contains three unrelated things called "skills". See
> [Name collisions](#name-collisions) before you go looking in the wrong directory.

---

## Install

```bash
# One command (recommended)
./scripts/install-claude-plugins.sh

# …or manually, inside Claude Code:
/plugin marketplace add theCreator177/RaidersRouter
/plugin install raiders-toolkit@raiders-router
/plugin install agent-architecture@raiders-router
/plugin install watch@raiders-router
# …etc, see the table below

# Local development against this checkout (no GitHub round-trip):
claude --plugin-dir ./plugins/raiders-toolkit
./scripts/install-claude-plugins.sh --local
```

Preview without installing: `./scripts/install-claude-plugins.sh --list`.

After installing, restart Claude Code — newly added top-level skills are discovered at startup.
Verify with `/plugin`, and reload during development with `/reload-plugins`.

### Optional: pre-seed project settings

Installing via the CLI writes the config for you. If you'd rather commit the enablement so
teammates are prompted automatically, create `.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "raiders-router": {
      "source": { "source": "github", "repo": "theCreator177/RaidersRouter" }
    }
  },
  "enabledPlugins": {
    "raiders-toolkit@raiders-router": true,
    "agent-architecture@raiders-router": true,
    "watch@raiders-router": true,
    "mattpocock-skills@raiders-router": true,
    "codex@raiders-router": true,
    "omniroute-skills@raiders-router": true,
    "code-review-graph@raiders-router": true,
    "ai-engineering-skills@raiders-router": true,
    "openship-config@raiders-router": true
  }
}
```

⚠️ **`.gitignore` blanket-ignores `.claude/`** (lines 13 and 209). To commit that file you must add a
negation rule (`!.claude/settings.json`) *after* those lines, or it will be silently untracked.

---

## What's bundled

Nine plugins: eight covering twelve upstream repositories, plus one authored here from source material.

### Authored here (no upstream repo — built from source material)

| Plugin | Source | What you get |
| --- | --- | --- |
| `agent-architecture` | [@elune0x](https://x.com/elune0x/status/2082133200386555918) | Two skills for building/debugging agents as three layers: `loop-graph-harness` (design) and `agent-failure-triage` (route a symptom to the layer that owns it). Bundles a tooling reference covering Temporal, LangGraph, NetworkX, E2B, OpenAI Evals, OpenTelemetry. |

### Installed directly (upstream is already a Claude Code plugin)

| Plugin | Upstream | What you get |
| --- | --- | --- |
| `watch` | [bradautomates/claude-video](https://github.com/bradautomates/claude-video) | Claude can actually watch a video — yt-dlp download, ffmpeg frames, captions w/ Whisper fallback. **Needs `yt-dlp` + `ffmpeg`.** |
| `mattpocock-skills` | [mattpocock/skills](https://github.com/mattpocock/skills) | ~20 engineering skills: `tdd`, `code-review`, `diagnosing-bugs`, `domain-modeling`, plus `/grill-me`, `/triage`, `/implement`, `/to-spec`, `/handoff`. |
| `codex` | [openai/codex-plugin-cc](https://github.com/openai/codex-plugin-cc) | `/codex:review`, `/codex:adversarial-review`, `/codex:rescue`, `/codex:transfer`. **Needs the Codex CLI.** Pulled via `git-subdir` from `plugins/codex`. |

### Adapted (upstream ships skills but no plugin manifest)

These use marketplace `strict: false` + an explicit `skills` path, so the upstream repo is consumed
as-is with **no fork and no file copying**.

| Plugin | Upstream | Adapted from |
| --- | --- | --- |
| `omniroute-skills` | [diegosouzapw/OmniRoute](https://github.com/diegosouzapw/OmniRoute) | `./skills` — ~43 skills (`omni-auth`, `omni-mcp`, `omni-combos-routing`, CLI skills…) |
| `code-review-graph` | [tirth8205/code-review-graph](https://github.com/tirth8205/code-review-graph) | `./skills` — 7 skills; a ~30-tool MCP server is available separately via `code-review-graph serve` |
| `ai-engineering-skills` | [rohitg00/ai-engineering-from-scratch](https://github.com/rohitg00/ai-engineering-from-scratch) | `./.claude/skills` — `find-your-level`, `check-understanding` |
| `openship-config` | [oblien/openship](https://github.com/oblien/openship) | `./.claude/skills` — the `openship-config` deployment skill |

### Wrapped locally (`raiders-toolkit`)

Six sources are **not** Claude Code plugins — standalone binaries, a data corpus, a
Chinese-language prompt collection, and an infographic. There is nothing to "install" in the plugin
sense, so this repo authors skills that teach Claude to *use* them.
Source: `plugins/raiders-toolkit/skills/`.

| Skill | Upstream | Why wrapped |
| --- | --- | --- |
| `superfile` | [yorukot/superfile](https://github.com/yorukot/superfile) | Go TUI, **no headless mode**. Skill covers install, config/hotkey/theme authoring, `--print-last-dir` shell integration, and doing the actual reorganizing with CLI tools. |
| `strix` | [usestrix/strix](https://github.com/usestrix/strix) | Standalone Python pentest agent. Skill installs it, shells out, parses findings. **Gated on authorization.** |
| `jcode` | [1jehuang/jcode](https://github.com/1jehuang/jcode) | Rust agent harness — a *peer* of Claude Code, not a plugin. Skill covers install + when delegating is actually worth it. |
| `system-prompts-reference` | [asgeirtj/system_prompts_leaks](https://github.com/asgeirtj/system_prompts_leaks) | Pure Markdown data (CC0). Skill teaches targeted fetching + accuracy caveats. |
| `investment-research` | [xbtlin/ai-berkshire](https://github.com/xbtlin/ai-berkshire) | Upstream is Simplified Chinese flat files with no frontmatter. **Translated to English** and restructured into skill format. |
| `graph-loop` | [@kingwilliam_ infographic](https://x.com/kingwilliam_/status/2080359562679349316) | Not a repo at all — a 12-panel image. Transcribed into a method skill: router (`CLAUDE.md`), one-line index, one-idea nodes, sharp edges, and **retrieval as code** (step 9). |

---

## Name collisions

Three unrelated "skills" concepts live in this repo. Don't confuse them:

| Path | What it is |
| --- | --- |
| `plugins/raiders-toolkit/skills/` | **Claude Code skills** — the subject of this guide. |
| `skills/` (repo root) | **Agent Skills manifests** — 46 generated docs following the agentskills.io standard, describing OmniRoute's REST/CLI surface for *any* agent. Generated by `src/lib/agentSkills/generator.ts`; edits are overwritten. |
| `src/lib/skills/` | **OmniRoute's runtime skill framework** — sandboxed, DB-persisted, per-API-key executable units. A product feature. Unrelated to Claude Code. |

The root `skills/` tree is already in valid `<name>/SKILL.md` shape, so it *could* be exposed as a
plugin later by adding a `.claude-plugin/plugin.json` at the repo root — no files would need moving.
That is deliberately **not** done here, to avoid publishing 46 `omni-*`/`cli-*` skills into every
consumer's namespace.

---

## Maintaining

- **Validate** before pushing: `claude plugin validate .` and
  `claude plugin validate ./plugins/raiders-toolkit`.
- **Pin an upstream** by adding `"ref": "v1.2.3"` or `"sha": "<commit>"` to a plugin's `source`.
  When both are present, `sha` wins. Unpinned GitHub sources track the default branch.
- **Version bumps:** `plugins/raiders-toolkit/.claude-plugin/plugin.json` sets an explicit `version`.
  Without one, the commit SHA becomes the version and *every commit* is a new release.
- **Adding a wrapper skill:** create `plugins/raiders-toolkit/skills/<name>/SKILL.md` with YAML
  frontmatter (`description` is the field that drives auto-invocation; `name` defaults to the
  directory name). Test with `claude --plugin-dir ./plugins/raiders-toolkit`.

## Security notes

- `strix` actively exploits targets. The skill requires confirming authorization before every run.
- `system-prompts-reference` is unverified community-extracted data — cite it as *claimed*, never authoritative.
- `investment-research` produces analysis, **not** financial advice.
- Adapted plugins pull from upstream repos at install time; pin with `ref`/`sha` if you need
  reproducibility or want to review changes before they reach your machine.
