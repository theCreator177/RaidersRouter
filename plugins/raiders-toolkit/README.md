# raiders-toolkit

Wrapper, reference, and translated Claude Code skills for tools that are **not** native Claude Code
plugins. Bundled by the [RaidersRouter marketplace](../../docs/guides/CLAUDE-CODE-PLUGINS.md).

Each upstream here is a standalone binary, a data corpus, or a non-English prompt collection — none
of them can be installed as a plugin, so this plugin teaches Claude how to *use* them instead.

| Skill | Upstream | License | Purpose |
| --- | --- | --- | --- |
| `superfile` | [yorukot/superfile](https://github.com/yorukot/superfile) | MIT | Install/configure the `spf` terminal file manager, wire cd-on-quit, and organize directories |
| `strix` | [usestrix/strix](https://github.com/usestrix/strix) | Apache-2.0 | Run the autonomous pentest agent against **authorized** targets and triage findings |
| `jcode` | [1jehuang/jcode](https://github.com/1jehuang/jcode) | MIT | Install the Rust coding harness; delegate bounded subtasks or benchmark |
| `system-prompts-reference` | [asgeirtj/system_prompts_leaks](https://github.com/asgeirtj/system_prompts_leaks) | CC0-1.0 | Consult a public corpus of extracted system prompts for prompt-engineering prior art |
| `investment-research` | [xbtlin/ai-berkshire](https://github.com/xbtlin/ai-berkshire) | MIT | Buffett/Munger/Duan Yongping/Li Lu research framework — **translated from Chinese to English** |

## Local development

```bash
claude --plugin-dir ./plugins/raiders-toolkit   # load without installing
claude plugin validate ./plugins/raiders-toolkit
```

Then `/reload-plugins` to pick up edits mid-session.

## Adding a skill

Create `skills/<name>/SKILL.md` with YAML frontmatter. Only `description` really matters — it drives
auto-invocation, and `name` defaults to the directory name. `when_to_use` sharpens triggering.

```yaml
---
name: my-skill
description: >
  What it does and when Claude should reach for it.
when_to_use: >
  Concrete user phrasings that should trigger this.
---
```

Keep wrapper skills honest: if the upstream tool is a poor fit for agent use, say so in the skill
body rather than pretending otherwise. See `jcode/SKILL.md` and `superfile/SKILL.md` for that pattern.
