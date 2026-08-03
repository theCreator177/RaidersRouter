---
name: loop-graph-harness
description: >
  Design an AI agent as three separate systems — the LOOP (controls repetition: turns, retries,
  budgets, exits), the GRAPH (controls topology: nodes, edges, state, branches, checkpoints), and
  the HARNESS (controls reality: tools, permissions, memory, sandboxes, evals, traces, humans).
  Use this whenever someone is architecting, reviewing, or rewriting an agent — including when
  they say "build an agent", "agent loop", "agentic workflow", "multi-step agent", "my agent
  won't stop", "the agent went rogue", or are choosing between LangGraph / Temporal / a plain
  while-loop. Reach for it even when the request sounds like a simple loop, because treating the
  loop as the whole system is the specific mistake this skill exists to prevent.
when_to_use: >
  Designing or rewriting an agent; choosing an agent framework; reviewing an agent architecture;
  deciding where retries, state, permissions, or evals belong; an agent that loops forever, is
  unexplainable, or has too much access.
---

# Loop vs Graph vs Harness engineering

**Source:** [@elune0x](https://x.com/elune0x/status/2082133200386555918), quoting
"The 3 AI Agent Systems Every Builder Must Understand" by [@0xwhrrari](https://x.com/0xwhrrari).

> Your agent is not a loop. The loop is the smallest part of the system.

Most teams use *loop*, *graph*, and *harness* to mean the same thing. That conflation is why agent
debugging feels impossible: when the three are one undifferentiated blob, a symptom has no home,
so every bug becomes a search of the entire system. Naming the layers is what makes failures
addressable.

## The containment order

```
harness  ─ controls reality
└── graph    ─ controls topology
    └── loop     ─ controls repetition
        └── prompt
            └── model
```

The prompt sits inside the loop. The loop sits inside the graph. The graph sits inside the harness.
**The model is the smallest box in the system** — which is why "just use a better model" so rarely
fixes an agent that is actually broken at an outer layer.

Read the failure modes as a set; each layer has exactly one:

| Missing layer | What happens |
| --- | --- |
| No loop engineering | **It never stops.** Infinite turns, runaway spend, no exit condition. |
| No graph engineering | **You cannot see why.** No topology, no state, no checkpoints — the run is unexplainable after the fact. |
| No harness engineering | **It can touch anything.** Unsandboxed execution, unbounded permissions, no trace, no eval gate. |

---

## Layer 1 — Loop engineering: controls repetition

**Owns:** turns · retries · budgets · exits · no-progress detection

The loop decides *how many times* and *when to stop*. Design it explicitly rather than letting
`while True` plus a hopeful prompt stand in for a policy:

- **Turn cap** — a hard ceiling on iterations, independent of what the model claims it needs.
- **Budget** — tokens and wall-clock, enforced by code. A model cannot be trusted to police its own spend.
- **Retry policy** — which errors are retryable, how backoff escalates, and which are permanent and should fail immediately rather than burning the budget.
- **Exit conditions** — success, explicit give-up, and the one teams forget: **no-progress detection**. An agent repeating the same failing action is not making progress even though it is producing turns. Detect repetition and break out.

**When a run must survive process failure**, this becomes durable execution — the loop's state
outlives the machine running it, so a crash resumes rather than restarts.
→ [`temporalio/temporal`](https://github.com/temporalio/temporal)

Reach for durable execution when a run is long, expensive, or has side effects you cannot replay.
A 20-second loop does not need it; a multi-hour pipeline that provisions infrastructure does.

## Layer 2 — Graph engineering: controls topology

**Owns:** nodes · edges · state · branches · cycles · checkpoints

The graph decides *what can follow what*. It is the difference between an agent whose path you can
reconstruct and one that is a black box.

- **Nodes** — discrete steps with defined inputs and outputs.
- **Edges** — legal transitions. Constraining these is what makes behavior reviewable.
- **State** — what carries between nodes, explicitly, rather than smuggled through prompt text.
- **Branches and cycles** — conditional routing and deliberate repetition, distinct from the loop's turn counter.
- **Checkpoints** — persisted state at node boundaries, so a run can be inspected, resumed, or forked.

**When the agent chooses its own next step**, use a stateful graph rather than hand-rolled
branching — the framework gives you state, checkpointing, and replay for free.
→ [`langchain-ai/langgraph`](https://github.com/langchain-ai/langgraph)

**When the topology itself needs analysis** — finding cycles, computing reachability, detecting
unreachable nodes or bottleneck paths — use real graph algorithms instead of eyeballing a diagram.
→ [`networkx/networkx`](https://github.com/networkx/networkx)

A useful test: if you cannot answer *"why did it do that?"* by reading persisted state and a path
through nodes, the graph layer is missing regardless of how sophisticated the prompt is.

## Layer 3 — Harness engineering: controls reality

**Owns:** tools · permissions · memory · sandboxes · evals · traces · humans

The harness decides *what the agent can actually touch*. This is the layer that determines blast
radius, and the one most often skipped because nothing breaks until it does.

- **Tools** — what actions exist at all. The tool list is a capability boundary, not a convenience.
- **Permissions** — scope per tool. Read-only by default; escalate deliberately.
- **Memory** — what persists across runs, and what is deliberately forgotten.
- **Humans** — where approval is required before an irreversible action.

Three concrete practices, each with a reference implementation:

**Isolate code and tool execution from the host.** An agent running generated code on the machine
that holds your credentials is a single prompt injection away from disaster.
→ [`e2b-dev/E2B`](https://github.com/e2b-dev/E2B)

**Put an eval gate before every model or prompt change.** Prompt edits are code changes with no
type system — without an eval gate, regressions ship silently and are discovered in production.
→ [`openai/evals`](https://github.com/openai/evals)

**Keep one trace across every model node and tool call.** A single correlated trace is what turns
"the agent did something weird" into a specific span with inputs and outputs.
→ [`open-telemetry/opentelemetry-python`](https://github.com/open-telemetry/opentelemetry-python)

---

## Using this when designing or reviewing an agent

Work outside-in — the harness constrains the graph, which constrains the loop. Deciding the loop
first tends to produce a system whose safety properties have to be retrofitted:

1. **Harness first.** What may this agent touch? Which actions are irreversible and need a human?
   Where does code execute? What is traced? What eval gate guards prompt changes?
2. **Graph second.** What are the steps, what may follow what, what state carries between them, and
   where are the checkpoints?
3. **Loop third.** Turn cap, token and time budget, retry policy, and the no-progress exit.
4. **Prompt last.** By this point the prompt only has to be good at one node's job, not at being the
   entire control system.

When reviewing someone else's agent, ask which layer each concern lives in. Concerns that cannot be
placed are usually the bugs — a retry policy embedded in prompt text, or permissions implied by
"the model knows not to do that," are layer violations that will fail under load or adversarial input.

For the full tool landscape and selection guidance, see `references/tooling.md`.
