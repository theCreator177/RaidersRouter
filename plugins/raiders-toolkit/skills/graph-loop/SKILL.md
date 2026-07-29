---
name: graph-loop
description: >
  Turn a flat pile of notes, docs, or context files into a graph the model walks in
  milliseconds instead of reading in full — a router (CLAUDE.md), a one-line-per-node index,
  single-idea nodes, sharp edges, and code-based retrieval. Use this when a knowledge base /
  second brain / docs folder has grown into an unsearchable pile, when context costs are too
  high because the agent reads everything, when someone asks how to structure CLAUDE.md or an
  agent memory folder, or when they mention "graph loop", "pile to system", or "second brain
  is a mess".
when_to_use: >
  "My second brain / notes / docs are a mess"; context window blowing up because the agent
  reads every file; designing CLAUDE.md or an agent memory layout; building retrieval over a
  notes folder; wanting agent memory that persists across runs.
---

# Graph Loop — 12 steps from pile to system

**Source:** infographic by [@kingwilliam_](https://x.com/kingwilliam_/status/2080359562679349316)
(transcribed from screenshots; the post itself is behind X's auth wall)

> From a flat folder the model reads in full, to a graph it walks in milliseconds. Each step
> removes one thing the model has to think about. **Step 9 is the one almost nobody does.**

The premise: retrieval is a *scoring* problem, not an intelligence problem. Code can do the
finding in milliseconds; the model should fire **once**, at the end, on a small set of
already-selected nodes.

---

## Part 1 · Concept (you own it) — steps 1–4

### 1. A graph is a router, not a picture
`router` · `index` · `nodes` · `edges`

The pretty graph view is for **you**. The index is for the **model**. Only one of them makes
retrieval faster. If you're admiring a force-directed diagram, you're building the wrong artifact.

### 2. The whole graph lives in one folder
`brain/` · `CLAUDE.md` · `nodes/` · `state/`

```
brain/
├── CLAUDE.md     the router      (<500 tokens, pointers only)
├── index.md      the index       (one line per node)
├── nodes/        the content     (one idea per file)
└── state/        the memory      (STATE.md, written every run)
```

One rule keeps it clean: **you should be able to say why every file exists.** If you can't
justify a file in one sentence, it doesn't belong.

### 3. Pile vs graph vs system

```
pile ─────────── graph ─────────── system
```

Most "my second brain is a mess" pain is these three tangled together. Untangle them and it
gets fast:
- **Pile** — files exist, nothing points anywhere. Retrieval = full scan.
- **Graph** — nodes + index + edges. Retrieval = walk.
- **System** — the graph plus memory and a test loop. It improves per run.

### 4. The default brain is a hoarder, not a librarian
`no structure` · `reads everything` · `$50/M out`

4,000 notes, full scan, every question. A hoarder owns everything and finds nothing. The next
five steps turn it into a librarian.

---

## Part 2 · Build (you write) — steps 5–8

### 5. The router — `CLAUDE.md`, kept brutally short
`<500 tokens` · `pointers only` · `no answers`

```
"billing lives here"  →  CLAUDE.md (<500 tok)  →  nodes/
```

**The killer mistake:** it grows into a novel, and every session drags that novel into context
before doing a single thing. The router answers *where*, never *what*. If a line in CLAUDE.md
contains an actual answer, it belongs in a node.

### 6. The index — one line per node
`index.md` · `auto-append` · `never drifts`

| file | covers |
| --- | --- |
| `billing-rules.md` | rates, refunds |
| `client-acme.md` | contacts, scope |
| `voice.md` | tone rules |

**This is the secret.** A current index makes retrieval cheap for life — a stale one turns the
graph straight back into a pile. Auto-append on node creation; never hand-maintain it.

### 7. Nodes — one idea per file, no exceptions
`split by idea` · `named clearly` · `no mega-notes`

```
4,000-word mega-note  →  split by idea  →  use 1 line
```

The enemy is the file that touches ten topics. Small nodes are cheap to open; fat ones bleed
tokens on every retrieval that only needed one paragraph of them.

### 8. Edges — pointers, not the pretty picture
`10 sharp edges` · `not 50` · `real graph`

```
node A ──── one edge, one route ────  node B
```

A node answers half the question and links to the one that finishes it. One edge followed —
not a ransacked vault. Ten sharp edges beat fifty decorative ones.

---

## Part 3 · The move nobody makes — step 9

### 9. Retrieval as code, not model calls
`keywords` · `score index.md` · `open top node` · `model runs once`

```
question  →  keywords  →  score index.md  →  model, once
```

**Finding needs zero intelligence.** It's a scoring problem. Code does steps 1–5 in
milliseconds; the model fires once, at the end.

Concretely:
1. Extract keywords from the question (plain string processing).
2. Score every line of `index.md` against those keywords.
3. Take the top N nodes.
4. Follow their edges one hop.
5. Open only that set — then call the model **once**.

Everything before the last step is deterministic code. Most setups skip this and let the model
do the searching, which is what makes them slow and expensive.

---

## Part 4 · Compound — steps 10–11

### 10. Prove it — race the graph against the pile
`/goal` · `same questions` · `tokens + wall-clock`

```
pile   ████████████████████████
graph  ███
                 tokens, wall-clock
```

**Don't trust it, race it.** Same questions, both layouts, measure tokens and wall-clock. One
real build cut cost 40% and came back faster — verified, not assumed. If your graph doesn't
beat the pile on a measured run, the graph is wrong; fix it before building on it.

### 11. Add memory — what the model forgets, the graph keeps
`STATE.md` · `write every run` · `graduates to skill`

```
run N  →  STATE.md  →  run N+1
```

The model wipes clean between runs. The graph doesn't have to — **that is the honest meaning
of "self-improving."** Write what was learned to `STATE.md` each run. When a `STATE.md` entry
stabilizes and keeps proving useful, graduate it into a real node or a skill.

---

## Part 5 · Top — step 12

### 12. Ship it — portable, and yours
`plain text` · `model-agnostic` · `you keep it`

**Models are engines; the graph is the car.** Unplug one model, plug in the next, lose nothing.
Keep the whole thing plain text — no proprietary format, no vendor database, no lock-in.

---

## Applying this

When someone asks for help with a messy knowledge base, work the steps in order — the concept
steps decide the shape, the build steps create it, step 9 is where the speed actually comes from:

1. **Audit** — count files, find the mega-notes, check whether an index exists and is current.
2. **Shape** — establish `brain/` with router, index, nodes, state.
3. **Split** — break mega-notes into one-idea nodes; name them for what they answer.
4. **Index** — generate one line per node; wire auto-append so it can't drift.
5. **Edge** — add only edges that complete a question. Resist decoration.
6. **Code the retrieval** — keyword scoring over the index, in real code. Model fires once.
7. **Race it** — same questions against the old pile; report tokens and wall-clock honestly.
8. **Add STATE.md** — persist what each run learned.

Failure modes to call out when you see them: a CLAUDE.md that answers instead of pointing, an
index nobody updates, nodes that touch ten topics, edges added for the diagram's sake, and
retrieval delegated to the model instead of to code.
