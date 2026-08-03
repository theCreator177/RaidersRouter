# Reference tools by layer

The six projects cited in the source post, plus when each is actually worth adopting. Read this
when choosing infrastructure for a layer; the parent `SKILL.md` covers the design principles.

## Contents

- [Loop layer](#loop-layer)
- [Graph layer](#graph-layer)
- [Harness layer](#harness-layer)
- [Adoption order](#adoption-order)
- [When you do not need any of this](#when-you-do-not-need-any-of-this)

---

## Loop layer

### Temporal — durable execution
[`temporalio/temporal`](https://github.com/temporalio/temporal) · MIT · Go (SDKs: Go, Java, Python, TypeScript, .NET, PHP, Ruby)

Workflow state is persisted and replayed, so a run survives process crashes, deploys, and machine
loss. Retries, timeouts, and backoff become declarative policy rather than hand-written control flow.

**Adopt when** a run is long-lived, expensive, or has side effects you cannot simply replay —
provisioning infrastructure, moving money, multi-hour pipelines, anything where "start over" is
unacceptable.

**Skip when** runs are short and cheap. Temporal introduces a server, workers, and a programming
model whose constraints (determinism in workflow code) are real. A 30-second agent loop with a turn
cap does not need it.

**Alternatives:** Restate, Inngest, AWS Step Functions, or plain durable state in Postgres. The
pattern matters more than the vendor — the question is whether loop state outlives the process.

---

## Graph layer

### LangGraph — stateful agent graphs
[`langchain-ai/langgraph`](https://github.com/langchain-ai/langgraph) · MIT · Python + JS

Agents as explicit state machines: nodes, edges, typed shared state, conditional routing, cycles,
and checkpointing. Checkpointers give resume, time-travel, and human-in-the-loop interrupts.

**Adopt when** the agent chooses its own next step and you need that choice to be inspectable —
branching workflows, multi-agent handoff, anything requiring resume-from-failure or human approval
mid-run.

**Skip when** the flow is a fixed pipeline. A linear chain of three steps is clearer as three
function calls; a graph framework adds indirection without buying constrained topology you needed.

**Note:** LangGraph is usable without the wider LangChain ecosystem — adopting it does not commit
you to LangChain abstractions.

**Alternatives:** plain state machines, Temporal (which can serve both layers), or a hand-rolled
node/edge dispatcher when the topology is small and stable.

### NetworkX — graph algorithms
[`networkx/networkx`](https://github.com/networkx/networkx) · BSD-3 · Python

General graph analysis: cycle detection, reachability, topological sort, shortest paths, centrality.

**Adopt when** the topology itself is the object of study — validating that a generated workflow is
acyclic, finding unreachable nodes, detecting bottleneck paths, analyzing a tool-dependency graph.

**Skip when** you only need to *execute* a graph. NetworkX analyzes structure; it does not run
agents. Reaching for it to orchestrate is a category error.

Distinguish this from *runtime* topology: NetworkX answers "is this graph well-formed?", LangGraph
answers "what runs next?"

---

## Harness layer

### E2B — sandboxed execution
[`e2b-dev/E2B`](https://github.com/e2b-dev/E2B) · Apache-2.0 · Python + JS SDKs

Firecracker microVM sandboxes for running agent-generated code and tool calls off the host, with
filesystem and process isolation and a controllable network boundary.

**Adopt when** the agent executes generated code, runs untrusted tools, or processes untrusted
input that could carry prompt injection. This is the single highest-leverage harness control: it
bounds blast radius even when every other control fails.

**Skip when** the agent only calls well-defined APIs with no code execution — though note that a
tool which shells out is code execution regardless of how it is labeled.

**Alternatives:** Docker with a hardened profile, gVisor, Firecracker directly, or cloud-provider
sandboxes. Isolation is the requirement; E2B is one implementation.

### OpenAI Evals — eval gating
[`openai/evals`](https://github.com/openai/evals) · MIT · Python

A framework plus registry for benchmarking model and prompt behavior against fixed cases.

**Adopt when** prompts or models change with any regularity. Prompt edits are code changes with no
type system and no compiler — an eval gate is the only thing standing between a plausible-looking
edit and a silent production regression.

**Skip when** the agent is a one-off. But note the common trajectory: "this is a prototype" becomes
a production dependency without an eval suite ever being added.

**Alternatives:** promptfoo, Braintrust, LangSmith, DeepEval, or a plain pytest suite over recorded
cases. A modest homegrown suite that actually runs on every change beats a sophisticated one that
does not.

### OpenTelemetry — tracing
[`open-telemetry/opentelemetry-python`](https://github.com/open-telemetry/opentelemetry-python) · Apache-2.0 · Python (all major languages available)

Vendor-neutral distributed tracing. One correlated trace spanning every model call, tool
invocation, and graph node.

**Adopt when** an agent has more than a couple of steps. The payoff is diagnostic: a single trace
converts "the agent did something weird" into a specific span with inputs, outputs, and timing.

Prefer OTel over a proprietary tracer when you want to avoid re-instrumenting later — the semantic
conventions for GenAI spans are converging, and most LLM observability vendors ingest OTLP.

**Alternatives:** LangSmith, Langfuse, Phoenix, Helicone — several of which are OTel-compatible, so
this is often "OTel plus a backend" rather than either/or.

---

## Adoption order

Adopting all six at once on a new project is usually a mistake — the harness controls that prevent
catastrophe are cheaper and more urgent than the ones that improve iteration speed.

1. **Tracing** — cheapest, and every later debugging session depends on it.
2. **Sandboxing** — as soon as any code execution exists. Bounds the worst case.
3. **Loop budgets and exits** — plain code, no dependency. Prevents runaway spend.
4. **Eval gate** — as soon as prompts change more than occasionally.
5. **Stateful graph** — when branching or resume becomes real, not before.
6. **Durable execution** — when a lost run genuinely costs something.

## When you do not need any of this

A single model call with one tool and a three-turn cap is not an agent system; it is a function.
Adding a graph framework and a workflow engine to it produces ceremony, not reliability.

The layers earn their keep as autonomy grows. The useful question is not "which framework?" but
**"which layer currently has no control at all?"** — because that is where the next incident comes
from. A prototype with a turn cap and a sandbox is in better shape than a sophisticated graph
running unsandboxed with no budget.
