# agent-architecture

> Your agent is not a loop. The loop is the smallest part of the system.

Two Claude Code skills for building and debugging AI agents as **three separate systems** rather
than one undifferentiated blob.

Transcribed from [@elune0x](https://x.com/elune0x/status/2082133200386555918), which quotes
"The 3 AI Agent Systems Every Builder Must Understand" by [@0xwhrrari](https://x.com/0xwhrrari).

## The idea

Most teams use *loop*, *graph*, and *harness* interchangeably. That conflation is precisely why
agent debugging feels impossible — a symptom has no home, so every bug becomes a search of the
whole system.

```
harness  ─ controls reality     (tools, permissions, memory, sandboxes, evals, traces, humans)
└── graph    ─ controls topology   (nodes, edges, state, branches, cycles, checkpoints)
    └── loop     ─ controls repetition (turns, retries, budgets, exits, no-progress)
        └── prompt
            └── model            ← the smallest box in the system
```

| Missing layer | Failure signature |
| --- | --- |
| Loop | **It never stops** |
| Graph | **You cannot see why** |
| Harness | **It can touch anything** |

## Skills

| Skill | Use it when |
| --- | --- |
| `loop-graph-harness` | Designing, reviewing, or rewriting an agent; choosing between LangGraph / Temporal / a plain loop; deciding where retries, state, permissions, or evals belong |
| `agent-failure-triage` | An agent loops forever, can't explain itself, has too much access, or a prompt change silently regressed — routes the symptom to the layer that owns it |

`loop-graph-harness` bundles `references/tooling.md`, covering the six reference projects
(Temporal, LangGraph, NetworkX, E2B, OpenAI Evals, OpenTelemetry) with adoption guidance and an
explicit "when you do not need any of this" section.

## Install

```bash
/plugin marketplace add theCreator177/RaidersRouter
/plugin install agent-architecture@raiders-router
```

Local development:

```bash
claude --plugin-dir ./plugins/agent-architecture
claude plugin validate ./plugins/agent-architecture
```

## Design note

These skills deliberately push back on the reflex to fix every agent bug in the prompt. A control
that lives in prose is a suggestion; a control that lives in code is a guarantee. When a symptom
keeps returning after prompt edits, the bug almost always belongs to an outer layer.
