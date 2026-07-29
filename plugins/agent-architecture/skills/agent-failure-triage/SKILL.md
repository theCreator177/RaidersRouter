---
name: agent-failure-triage
description: >
  Diagnose a misbehaving AI agent by routing the symptom to the layer that owns it — loop
  (repetition), graph (topology), or harness (reality). Use this when an agent loops forever,
  burns tokens with no output, repeats the same failing action, produces unexplainable results,
  loses state between steps, calls a tool it should not have, ignores its budget, silently
  regressed after a prompt change, or when someone says "my agent is broken", "the agent went
  rogue", "it keeps retrying", or "I can't tell what it did". Reach for it whenever agent
  debugging feels like guesswork, since guesswork is the symptom of not having assigned the
  failure to a layer.
when_to_use: >
  Debugging an agent that won't stop, won't explain itself, or has too much access; a prompt
  change that quietly regressed; a runaway token bill; an agent stuck repeating an action.
---

# Agent failure triage — which layer owns this bug?

**Source:** [@elune0x](https://x.com/elune0x/status/2082133200386555918).
Companion to the `loop-graph-harness` skill, which covers designing the three layers.

Agent debugging feels impossible when *loop*, *graph*, and *harness* are treated as one thing — a
symptom has nowhere to live, so every bug triggers a search of the whole system. Triage restores
that structure: assign the symptom to a layer first, then debug only that layer.

The three failure signatures, which map one-to-one onto the missing layer:

- **It never stops** → loop
- **You cannot see why** → graph
- **It can touch anything** → harness

## Symptom → layer

| Symptom | Layer | Where to look |
| --- | --- | --- |
| Runs forever, never terminates | **Loop** | Missing turn cap or exit condition |
| Token/cost bill far above expectation | **Loop** | No budget enforced in code |
| Repeats the same failing action | **Loop** | No no-progress detection |
| Retries something that can never succeed | **Loop** | Permanent errors not separated from retryable |
| Crash restarts the whole run | **Loop** | Needs durable execution |
| "Why did it do that?" is unanswerable | **Graph** | No persisted state or node path |
| State lost between steps | **Graph** | State passed via prompt text, not graph state |
| Cannot resume or replay a failed run | **Graph** | No checkpoints at node boundaries |
| Takes a nonsensical next step | **Graph** | Edges unconstrained — any node can follow any node |
| Unreachable or dead-end steps | **Graph** | Topology needs analysis, not inspection |
| Called a tool it should not have | **Harness** | Permission scope too broad |
| Generated code touched the host | **Harness** | Execution not sandboxed |
| Leaked credentials or data | **Harness** | Tool boundary + trace review |
| Prompt change silently regressed quality | **Harness** | No eval gate before the change |
| Cannot reconstruct what happened | **Harness** | No single correlated trace |
| Did something irreversible unreviewed | **Harness** | Missing human-approval checkpoint |

## Triage procedure

1. **State the symptom in one sentence**, in observable terms. "It never stopped" and "it produced
   a wrong answer" are different bugs with different owners.
2. **Match the signature.** Never stops → loop. Cannot explain → graph. Touched something it
   shouldn't → harness. If it matches two, treat them as two bugs and triage separately — a
   runaway loop that also deleted a file is a loop bug *and* a harness bug.
3. **Debug inside that layer only.** Resist editing the prompt first. The prompt is the innermost
   box; a prompt patch that suppresses an outer-layer symptom hides the bug rather than fixing it,
   and it will resurface under different input.
4. **Fix at the layer that owns it**, then ask what made the failure *possible* — usually a missing
   control one layer out. An agent that deleted a file has a harness bug; that it deleted the file
   forty times is a loop bug too.
5. **Add the control that would have caught it** — a budget, a checkpoint, a permission scope, an
   eval case. Absent this, the same class recurs with different specifics.

## The prompt-patch trap

The most common failure in agent debugging is treating every bug as a prompt bug, because the
prompt is the easiest thing to edit. Watch for these:

- *"It won't stop"* → adding "please stop when done" to the prompt. The fix is a turn cap in code;
  a model cannot reliably enforce its own termination.
- *"It called the wrong tool"* → adding "do not use tool X". The fix is removing X from the tool
  list or scoping its permission. An instruction is not a boundary.
- *"It forgot the earlier step"* → restating context in the prompt every turn. The fix is explicit
  graph state; re-prompting scales badly and drifts.
- *"It overspent"* → asking the model to be concise. The fix is a budget enforced by the loop.

The pattern: **a control that lives in prose is a suggestion; a control that lives in code is a
guarantee.** When a symptom keeps returning after prompt edits, that is strong evidence the bug
belongs to an outer layer.

For layer design and the reference tools for each, see the `loop-graph-harness` skill.
