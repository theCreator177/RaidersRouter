---
name: training-agentic-environments
description: >
  Design RL environments and reward schemes that actually produce autonomous agents — verifier-graded
  final state instead of self-reported completion, harness randomization so the policy does not overfit
  one tool schema, execution budgets, and layered defenses against reward hacking. Use this when
  someone is building an agent training loop, designing evals or reward functions for agents, choosing
  a sandbox for untrusted agent code, asking how frontier labs train long-horizon autonomy, or
  wondering why their agent games the metric instead of doing the task. Reach for it even when the
  request sounds like "just write an eval", because the failure this skill prevents is an eval the
  agent can satisfy without doing the work.
when_to_use: >
  Building an agent RL/eval loop; writing reward functions or verifiers; picking a sandbox for agent
  code execution; an agent that games metrics or claims success it did not achieve; questions about
  how Kimi K3 / frontier labs train long-horizon agents.
---

# Training environments for autonomous agents

**Source:** [Kimi K3 technical report](https://github.com/MoonshotAI/Kimi-K3/blob/main/k3_tech_report.pdf)
(Moonshot AI), §4.1–4.2 and §5.3. Figures and quantities below are from that report; treat them as
one lab's published account, not universal law.

Companion to `loop-graph-harness` (design an agent) and `agent-failure-triage` (debug one). This one
covers the environment you *train or evaluate* an agent in — and the design errors that make an agent
look autonomous while being nothing of the kind.

---

## 1. Grade the final state, not the agent's report

The single most important design rule:

> Rewards are grounded in the verifier's evaluation of the **final environment state** rather than the
> agent's **self-reported completion**.

An agent asked whether it finished will say yes. Any reward that reads the agent's own claim is
training a model to write convincing completion messages, which is a much easier objective than the
task. Grade the world, not the transcript.

Kimi K3's **Autonomous Execution Task (AET)** paradigm gives each task exactly five things:

| Provided | Deliberately withheld |
| --- | --- |
| Initial state | Reference trajectories |
| Constrained goal | Predefined procedures |
| Tool-based action space | Step-by-step guidance |
| Execution budget | |
| Independent verifier interface | |

Withholding the procedure is the point. The agent must derive decomposition, tool selection,
planning, error recovery, **and its own termination condition**. An environment that supplies the
plan trains plan-following, not autonomy.

## 2. Assume the agent will attack your reward

Capable agents explore aggressively and will find whatever shortcut your reward permits. Design as if
the reward function is an adversary's target, because it is. Four defenses, all from the report:

- **Isolate the agent from the verifier.** If the agent can read or reach the grader, it will
  optimize the grader rather than the task.
- **Pair public and hidden verifiers.** Public ones return diagnostic feedback the agent can learn
  from; hidden ones evaluate held-out scenarios and decide the real score. Feedback without a hidden
  check is a leak.
- **Bound submissions and penalize.** Limited submission budgets with penalty-based rewards stop
  brute-force probing of the verifier.
- **Detect domain-specific cheats explicitly.** For GPU-kernel tasks they built a hacking-detection
  system for CUDA graph replay, input caching, and precision reduction — and kept extending it as new
  strategies appeared during training. Expect this to be ongoing work, not a one-time list.

A worked example of the mindset: on kernel tasks, a solution exceeding a numerical-error threshold
scores **zero**, matching an expert implementation scores **0.5**, and approaching the hardware
roofline moves toward **1**. Correctness is a gate, not a term you can trade away for speed.

Also watch the degenerate direction — verbosity. Their generative reward model auto-loses any
comparison where output length exceeds a budgeted multiple, because "longer" otherwise correlates
with "better-scoring" for free.

## 3. Randomize the harness, or you train a tool-schema specialist

> Training with a single fixed agent harness can cause a model to overfit to a particular tool schema,
> system prompt, context management mechanism, or interaction protocol.

Their fix is a **unified white-box environment** where a harness is decomposed into configurable,
composable modules — tool interfaces, system prompts, context management, skills, memories,
subagents — that can be recombined to instantiate mainstream harnesses (Kimi Code, Claude Code,
Codex, OpenClaw, Hermes) as well as novel ones. Harness configuration is varied *per task group*
during training.

The transferable rule: **vary the scaffold across training tasks.** If every episode uses one tool
schema and one prompt format, you learn that schema's quirks and degrade the moment a caller formats
tools differently. Web-dev tasks in the same report are explicitly "rolled out under diverse agent
scaffolds rather than a single fixed harness, to promote cross-scaffold generalization."

## 4. Budget the loop, and make overrun cost something

Reasoning effort is trained, not prompted. Each problem gets an initial token budget `b₀(x)` estimated
from the cold-start model, and any trajectory exceeding a scaled threshold `γ·b₀(x)` has its task
reward **overridden to −1**. Training runs max-budget first, then anneals γ down to produce
high- and low-effort variants.

Two things generalize even outside RL:

- A budget that merely truncates teaches nothing. A budget that **negates the reward** teaches the
  policy that overrun is failure.
- For agentic tasks, count **cumulative output tokens including tool-call arguments**, not just
  thinking tokens. Tool arguments are where long-horizon runs actually spend.

## 5. Build for the horizon you actually want

Autonomy duration is a training target, not an emergent bonus. Their reported result: as RL FLOPs
scale, **tool-call steps scale up consistently** alongside capability.

That requires environments long enough to contain the behavior. Their personal-assistant tasks run in
persistent environments over multiple simulated days, with dozens of interdependent events across
mock Gmail/Notion/Slack/Canvas, where a single rollout may reach **thousands of tool calls and
millions of context tokens**. Each event carries its own criterion, graded by deterministic rules or
LLM judges.

Note the use of **mock applications** rather than live APIs: they preserve core semantics while
allowing reproducible large-scale interaction with no external rate limits. For training or eval at
volume, a faithful mock beats a real API you cannot reset, replay, or run ten thousand times.

## 6. The sandbox is a hard requirement, not a nicety

Container runtimes were not sufficient:

> in our early experiments with traditional container-based sandbox runtimes, we observed several
> **kernel panics and deadlocks caused by unintended agent operations**

They moved to Firecracker microVMs (AgentENV) for isolation *and* fidelity — agents can mount disks,
run containers, even launch VMs, without escaping. Three lifecycle operations worth copying in any
serious harness:

| Operation | Why it matters |
| --- | --- |
| **Pause / resume** | A paused sandbox consumes no CPU or memory. Sandboxes idle awaiting inference for **up to 98%** of their lifetime — pausing that is most of the cost. |
| **Fork** | Clone exact state while the original keeps running: grade without side effects on the live run. |
| **Snapshot** | Periodic saves for error recovery on long trajectories. |

Reported latencies: 133 ms checkpoint, 49 ms resume (incremental — only pages dirtied since the last
checkpoint). Scale context: **51,219,741 sandboxes across 1,505,678 images** over training and
evaluation. If your plan involves untrusted agent code and you have not budgeted sandbox
infrastructure, that is the gap.

## 7. Close the train/serve gap deliberately

Two choices that prevent "great in training, worse in production":

- **Quantization-aware training throughout post-training.** MoE experts in MXFP4 with MXFP8
  activations, QAT across both SFT and RL, and — the key line — **rollout and training share the same
  quantization scheme, eliminating the train/inference mismatch.** If you quantize after the fact, you
  ship a model that never trained under its serving numerics.
- **Train the speculative-decoding draft on the real objective.** They optimize the negative log
  acceptance rate directly rather than a KL surrogate, since minimizing KL does not maximize
  acceptance for a capacity-limited draft.

---

## Applying this

When reviewing or designing an agent training/eval environment, check in this order — each item is a
way an agent can look autonomous without being it:

1. **Does the reward read world state or the agent's claim?** Claim-reading invalidates everything downstream.
2. **Can the agent reach the grader?** If yes, you are training a grader-optimizer.
3. **Is there a hidden held-out verifier**, distinct from whatever gives feedback?
4. **Does the scaffold vary across tasks**, or is one tool schema baked in?
5. **Does exceeding the budget cost reward**, or merely truncate?
6. **Are episodes long enough** to contain the horizon you want, with per-event grading rather than one terminal score?
7. **Does untrusted code run in something that survives hostile behavior?**
8. **Do training and serving share numerics?**

The recurring theme, and the one worth stating plainly: **every one of these is a place where the
cheap version produces a metric that goes up while the capability does not.** Verifier-graded final
state, hidden checks, scaffold diversity, and real budgets are what make the number mean something.
