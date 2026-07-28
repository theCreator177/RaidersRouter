---
name: system-prompts-reference
description: >
  Consult a large public corpus of extracted system prompts from major AI products (Claude, ChatGPT,
  Gemini, Grok, Cursor, Kimi, Qwen, DeepSeek, Perplexity, Notion and more) as reference material for
  prompt engineering. Use this when the user asks how a particular AI product structures its system
  prompt, wants to compare prompting patterns across vendors, is designing their own agent/system
  prompt and wants prior art, or references the system_prompts_leaks corpus.
when_to_use: >
  Prompt-engineering research; "how does <product> prompt its model"; comparing agent/tool-use
  prompt patterns across vendors; designing a system prompt and wanting real-world exemplars.
---

# System-prompt corpus — reference

**Upstream:** https://github.com/asgeirtj/system_prompts_leaks · **CC0-1.0 (public domain)**

A data repository — Markdown only, no code, no executables. Top-level folders are vendor names:
`Anthropic/`, `OpenAI/`, `Google/`, `xAI/`, `Meta/`, `Microsoft/`, `Cursor/`, `DeepSeek/`, `GLM/`,
`Kimi/`, `Mistral/`, `Notion/`, `OpenCode/`, `Perplexity/`, `Pi/`, `Qwen/`, `Misc/`.

## How to consult it

Fetch just the file you need rather than cloning the whole corpus:

```bash
# Browse a vendor directory
#   https://github.com/asgeirtj/system_prompts_leaks/tree/main/<Vendor>
# Fetch a specific prompt
#   https://raw.githubusercontent.com/asgeirtj/system_prompts_leaks/main/<Vendor>/<file>.md

# Optional: local clone for offline grep
git clone --depth 1 https://github.com/asgeirtj/system_prompts_leaks ~/.cache/system-prompts
rg -i "tool_use|<antml|thinking" ~/.cache/system-prompts/Anthropic/
```

## What it's genuinely useful for

- **Structural patterns:** how production prompts order role definition → capabilities → tool
  contracts → safety rules → formatting; how they delimit sections.
- **Tool-use contracts:** how vendors describe tools, arguments, and when-to-call heuristics.
- **Refusal/safety phrasing:** how boundaries get expressed without over-refusing.
- **Cross-vendor comparison:** the same capability (search, code execution, memory) framed several ways.

## Accuracy and use caveats

- These are **community-extracted and unverified**. Treat every file as *claimed* text, undated and
  possibly stale, partial, or model-hallucinated — not as an authoritative artifact. Say so when
  citing one.
- Products change constantly; a captured prompt reflects at best one moment.
- CC0 means no copyright barrier to reading/reusing, but **derive patterns, don't clone verbatim** —
  copying another product's prompt wholesale produces a worse prompt for *your* system and imports
  behaviors you didn't design.
- Never use the corpus to reconstruct or circumvent a live system's safety instructions.
