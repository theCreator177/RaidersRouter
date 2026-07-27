import {
  AgentGraphSpec,
  AgentGraphSpecSchema,
  AgentGraphValidation,
  AgentGraphRunResult,
  AgentGraphNodeResult,
  AgentGraphMessage,
  AgentInvoke,
  MAX_GRAPH_EDGES,
} from "./types";

export interface AgentGraphLogger {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
}

const NOOP_LOG: AgentGraphLogger = {
  info: () => undefined,
  warn: () => undefined,
  debug: () => undefined,
};

/**
 * Structural validation + topological wave computation (Kahn's algorithm).
 * Never throws — returns the full error list so callers (planner retry loop,
 * MCP validate tool, A2A skill) can surface every problem at once.
 */
export function validateAgentGraph(spec: AgentGraphSpec): AgentGraphValidation {
  const errors: string[] = [];
  const ids = new Set<string>();

  for (const node of spec.nodes) {
    if (ids.has(node.id)) errors.push(`Duplicate node id: ${node.id}`);
    ids.add(node.id);
  }

  let edgeCount = 0;
  for (const node of spec.nodes) {
    for (const dep of node.dependsOn ?? []) {
      edgeCount += 1;
      if (dep === node.id) errors.push(`Node ${node.id} depends on itself`);
      else if (!ids.has(dep)) errors.push(`Node ${node.id} depends on unknown node: ${dep}`);
    }
  }
  if (edgeCount > MAX_GRAPH_EDGES) {
    errors.push(`Graph has ${edgeCount} edges (max ${MAX_GRAPH_EDGES})`);
  }

  const waves: string[][] = [];
  if (errors.length === 0) {
    const indegree = new Map<string, number>();
    const dependents = new Map<string, string[]>();
    for (const node of spec.nodes) {
      indegree.set(node.id, (node.dependsOn ?? []).length);
      for (const dep of node.dependsOn ?? []) {
        const list = dependents.get(dep) ?? [];
        list.push(node.id);
        dependents.set(dep, list);
      }
    }

    let ready = spec.nodes.filter((n) => indegree.get(n.id) === 0).map((n) => n.id);
    let visited = 0;
    while (ready.length > 0) {
      waves.push(ready);
      visited += ready.length;
      const next: string[] = [];
      for (const id of ready) {
        for (const dependent of dependents.get(id) ?? []) {
          const remaining = (indegree.get(dependent) ?? 0) - 1;
          indegree.set(dependent, remaining);
          if (remaining === 0) next.push(dependent);
        }
      }
      ready = next;
    }
    if (visited !== spec.nodes.length) {
      errors.push("Graph contains a dependency cycle");
    }
  }

  return { ok: errors.length === 0, errors, waves: errors.length === 0 ? waves : [], edgeCount };
}

function buildNodeMessages(
  spec: AgentGraphSpec,
  nodeId: string,
  task: string,
  state: Record<string, AgentGraphNodeResult>
): AgentGraphMessage[] {
  const node = spec.nodes.find((n) => n.id === nodeId);
  if (!node) throw new Error(`Unknown node: ${nodeId}`);

  const systemParts = [
    `You are agent "${node.id}" in the multi-agent graph "${spec.name}".`,
    spec.description ? `Graph mission: ${spec.description}` : null,
    `Your role: ${node.role}`,
    "Upstream agents share their output with you through the shared state below. " +
      "If upstream outputs contradict each other, reconcile them: prefer verifiable, " +
      "internally consistent information and note unresolved conflicts explicitly.",
    "Respond with your contribution only — no preamble about being an agent.",
  ].filter(Boolean) as string[];

  const upstream = (node.dependsOn ?? [])
    .map((dep) => state[dep])
    .filter((r): r is AgentGraphNodeResult => Boolean(r && r.status === "completed"));

  const userParts = [`Task: ${task}`];
  if (upstream.length > 0) {
    userParts.push(
      "Shared state from upstream agents:\n" +
        upstream.map((r) => `--- ${r.nodeId} ---\n${r.output}`).join("\n\n")
    );
  }

  return [
    { role: "system", content: systemParts.join("\n\n") },
    { role: "user", content: userParts.join("\n\n") },
  ];
}

function resolveOutputNodeIds(spec: AgentGraphSpec): string[] {
  const flagged = spec.nodes.filter((n) => n.isOutput).map((n) => n.id);
  if (flagged.length > 0) return flagged;
  const withDependents = new Set<string>();
  for (const node of spec.nodes) {
    for (const dep of node.dependsOn ?? []) withDependents.add(dep);
  }
  return spec.nodes.filter((n) => !withDependents.has(n.id)).map((n) => n.id);
}

export interface ExecuteAgentGraphOptions {
  spec: AgentGraphSpec;
  /** The task/prompt the whole graph is solving. */
  task: string;
  invoke: AgentInvoke;
  log?: AgentGraphLogger;
  /** Model used for nodes without an explicit `model`. */
  defaultModel?: string;
}

/**
 * Executes a validated agent graph: independent nodes run in parallel waves,
 * each completed node writes its output into the shared state, and dependent
 * nodes read that state before running. A failed node marks its transitive
 * dependents as skipped instead of aborting the surviving branches.
 */
export async function executeAgentGraph(
  options: ExecuteAgentGraphOptions
): Promise<AgentGraphRunResult> {
  const { task, invoke, defaultModel } = options;
  const log = options.log ?? NOOP_LOG;
  const spec = AgentGraphSpecSchema.parse(options.spec);

  const validation = validateAgentGraph(spec);
  if (!validation.ok) {
    throw new Error(`Invalid agent graph: ${validation.errors.join("; ")}`);
  }

  const started = Date.now();
  const state: Record<string, AgentGraphNodeResult> = {};
  const nodeById = new Map(spec.nodes.map((n) => [n.id, n]));

  for (const wave of validation.waves) {
    log.debug("[agent-graph] wave start", { graph: spec.name, wave });
    await Promise.all(
      wave.map(async (nodeId) => {
        const node = nodeById.get(nodeId);
        if (!node) return;
        const failedUpstream = (node.dependsOn ?? []).filter(
          (dep) => state[dep]?.status !== "completed"
        );
        if (failedUpstream.length > 0) {
          state[nodeId] = {
            nodeId,
            status: "skipped",
            output: "",
            reason: `Upstream failed or skipped: ${failedUpstream.join(", ")}`,
            durationMs: 0,
          };
          return;
        }

        const nodeStarted = Date.now();
        const model = node.model || defaultModel;
        try {
          const output = await invoke({
            nodeId,
            model,
            messages: buildNodeMessages(spec, nodeId, task, state),
          });
          if (!output || !output.trim()) {
            throw new Error("Agent returned an empty response");
          }
          state[nodeId] = {
            nodeId,
            status: "completed",
            output: output.trim(),
            durationMs: Date.now() - nodeStarted,
            model,
          };
        } catch (err) {
          const reason = err instanceof Error ? err.message : "Agent invocation failed";
          log.warn("[agent-graph] node failed", { graph: spec.name, nodeId, reason });
          state[nodeId] = {
            nodeId,
            status: "failed",
            output: "",
            reason,
            durationMs: Date.now() - nodeStarted,
            model,
          };
        }
      })
    );
  }

  const outputNodeIds = resolveOutputNodeIds(spec);
  const completedOutputs = outputNodeIds
    .map((id) => state[id])
    .filter((r): r is AgentGraphNodeResult => Boolean(r && r.status === "completed"));

  if (completedOutputs.length === 0) {
    throw new Error("Agent graph produced no output: every output node failed or was skipped");
  }

  const output =
    completedOutputs.length === 1
      ? completedOutputs[0].output
      : completedOutputs.map((r) => `## ${r.nodeId}\n\n${r.output}`).join("\n\n");

  return {
    output,
    state,
    waves: validation.waves,
    outputNodeIds,
    durationMs: Date.now() - started,
  };
}
