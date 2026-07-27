# Graph Engineering & Context Engineering Stack

> Deploy a mesh of agents from a single prompt (planner-generated graph, parallel wave
> execution, continuously-updated shared state) and feed every agent the right information
> through the 3-layer context stack (global rules → project knowledge → task state).

Both features are framework-agnostic core libraries exposed through four surfaces:
A2A skills, MCP tools, runtime skill handlers, and example plugins.

---

## 1. Agent Graph Engine (`src/lib/agentGraph/`)

| File         | Role                                                                                           |
| :----------- | :--------------------------------------------------------------------------------------------- |
| `types.ts`   | `AgentGraphSpec`/`AgentGraphNode` Zod schemas, caps (40 nodes / 400 edges), `AgentInvoke` seam |
| `engine.ts`  | `validateAgentGraph()` (Kahn cycle detection + wave computation), `executeAgentGraph()`        |
| `planner.ts` | `planAgentGraph()` — one prompt → whole graph spec, Zod-validated, one feedback retry          |
| `invoke.ts`  | `createLoopbackAgentInvoke()` — nodes execute via `/v1/chat/completions` self-call             |

### Execution model

1. **Plan**: a planner model receives the task and emits the entire graph as strict JSON
   (agents + connections). Output is schema-validated and structurally validated; on
   failure the validation errors are fed back for one corrective retry.
2. **Validate**: duplicate ids, unknown/self dependencies, node/edge caps, and cycles
   (Kahn's algorithm) — `validateAgentGraph()` also yields the topological **waves**.
3. **Execute**: each wave runs in parallel (`Promise.all`). A completed node writes its
   output into the **shared state**; every dependent node receives the outputs of all its
   upstream nodes in its prompt and is instructed to reconcile contradictions. A failed
   node marks its transitive dependents `skipped` without aborting surviving branches.
4. **Output**: nodes flagged `isOutput` (default: the graph's sinks) form the final
   answer; multiple outputs are joined under `## <nodeId>` headings.

### Why nodes go through the loopback pipeline

`createLoopbackAgentInvoke()` POSTs each node to OmniRoute's own
`/v1/chat/completions`, so **combo routing, fallback, circuit breakers, cooldowns, and
policy checks apply per agent** and the engine never touches credentials. Two request
details matter:

- `x-omniroute-no-memory: true` header — disables memory _and_ skill injection on
  internal node calls. This is the recursion guard: a model inside a graph node can
  never be offered the `agent_graph_run` skill again.
- `x_agent_graph: { graph, node }` body marker — lets plugins observe node executions
  (see the `agent-graph-trace` example plugin). Upstream translators drop unknown
  fields, so the marker never reaches providers.

Error messages surfaced from node failures carry the HTTP status only (Hard Rule #12).

---

## 2. Context Engineering Stack (`src/lib/contextStack/`)

| File              | Role                                                                                      |
| :---------------- | :---------------------------------------------------------------------------------------- |
| `types.ts`        | Layer model (`global`/`project`/`task`), `ContextSection` Zod schemas                     |
| `builder.ts`      | `buildContextStack()` fixed-order assembly + token budget, `formatContextSystemMessage()` |
| `memoryBridge.ts` | `saveContextSection()`/`loadContextSections()` — persistence via the memory subsystem     |

The stack assembles in fixed order — global → project → task — and renders as one
system-message block that states the precedence rule explicitly. Under a `maxTokens`
budget, sections are dropped from the **task** layer first, then **project**; the
**global** layer is never dropped.

Persistence reuses `src/lib/memory/` (no new tables): keys are namespaced
`context-stack:<layer>:<slug>` with a `metadata.source: "context-stack"` discriminator,
UPSERT on (apiKeyId, key). Layer → memory type mapping: global = procedural,
project = semantic, task = episodic. Load at session start, save at session end.

---

## 3. Surfaces

### A2A skills (`src/lib/a2a/skills/`)

- **`graph-engineering`** — plan and/or run a graph. Metadata: `graph` (pre-built spec),
  `planOnly`, `model`, `plannerModel`, `maxNodes`.
- **`context-stack`** — `action: "build" | "save" | "load"`; `sections`, `includeSaved`,
  `maxTokens`, `apiKeyId` (persistence owner, default `a2a-context`), `layers`.

Both are registered in `A2A_SKILL_HANDLERS` and the Agent Card
(`src/app/.well-known/agent.json/route.ts`) — kept in sync by `npm run check:known-symbols`.

### MCP tools (`open-sse/mcp-server/tools/graphContextTools.ts`)

| Tool                             | Scope                 |
| :------------------------------- | :-------------------- |
| `omniroute_agent_graph_plan`     | `execute:agent-graph` |
| `omniroute_agent_graph_validate` | `read:agent-graph`    |
| `omniroute_agent_graph_run`      | `execute:agent-graph` |
| `omniroute_context_stack_build`  | `read:context-stack`  |
| `omniroute_context_stack_save`   | `write:context-stack` |
| `omniroute_context_stack_load`   | `read:context-stack`  |

### Runtime skill handlers (`src/lib/skills/builtin/graphEngineering.ts`)

`agent_graph_run` and `context_stack_build` are registered on `skillExecutor` at boot
(`src/server-init.ts`, `src/instrumentation-node.ts`). Create a DB skill row whose
`handler` column names one of them to advertise it to models through skill injection.

### Example plugins (`examples/plugins/`)

- **`context-stack`** — injects the global+project layers from plugin config as a leading
  system message on every chat request (the task layer is the request itself).
- **`agent-graph-trace`** — appends per-node JSONL trace entries (request + response
  preview) keyed by graph name; requires `file-read`/`file-write` permissions.

---

## 4. Tests

| Suite                                                     | Runner    | Covers                                           |
| :-------------------------------------------------------- | :-------- | :----------------------------------------------- |
| `tests/unit/agent-graph-engine.test.ts`                   | node:test | validation, waves, shared state, planner, invoke |
| `tests/unit/context-stack.test.ts`                        | node:test | layer ordering, budget, memory bridge round-trip |
| `tests/unit/graph-context-a2a.test.ts`                    | node:test | A2A registration + handlers                      |
| `tests/unit/graph-context-skill-handlers.test.ts`         | node:test | runtime skill handlers                           |
| `tests/unit/plugins-graph-context-examples.test.ts`       | node:test | plugin manifests + hook behavior                 |
| `open-sse/mcp-server/__tests__/graphContextTools.test.ts` | vitest    | MCP schemas, scopes, registration                |

## 5. Limits & safety

- Caps: 40 nodes, 400 edges per graph; planner default budget 15 nodes; per-node call
  timeout 120s; planner gets exactly one corrective retry.
- The engine is dependency-injected (`AgentInvoke`) — it never fetches credentials and
  never imports `chatCore`; the loopback closure is the only integration point.
- Context sections are Zod-capped (100 sections × 100k chars) and persistence is scoped
  by `apiKeyId`.
