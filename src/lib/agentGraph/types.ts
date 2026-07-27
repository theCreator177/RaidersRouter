import { z } from "zod";

/**
 * Agent Graph — graph-engineered multi-agent orchestration.
 *
 * A graph is a DAG of agent nodes. Each node is one LLM "agent" with a role
 * prompt and an optional model override. Edges (`dependsOn`) route the output
 * of upstream agents into the prompt of downstream agents, so the whole mesh
 * shares one continuously-updated state: every completed node writes its
 * output into the shared state, and every dependent node reads the state of
 * all of its upstream nodes before it runs. Independent nodes execute in
 * parallel waves.
 */

/** Hard cap on nodes per graph (mirrors fusion's maxPanel OOM guard, #1905). */
export const MAX_GRAPH_NODES = 40;

/** Hard cap on total edges (sum of dependsOn arrays). */
export const MAX_GRAPH_EDGES = 400;

/** Default node budget suggested to the planner. */
export const DEFAULT_PLANNER_MAX_NODES = 15;

export const AGENT_GRAPH_NODE_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export const AgentGraphNodeSchema = z
  .object({
    id: z
      .string()
      .regex(
        AGENT_GRAPH_NODE_ID_PATTERN,
        "Node id must be lowercase alphanumeric with dashes/underscores (max 64 chars)"
      ),
    role: z.string().min(1).max(4000),
    model: z.string().min(1).max(200).optional(),
    dependsOn: z.array(z.string()).max(MAX_GRAPH_NODES).default([]),
    isOutput: z.boolean().optional(),
  })
  .strict();

export const AgentGraphSpecSchema = z
  .object({
    name: z.string().min(1).max(120),
    description: z.string().max(2000).optional(),
    nodes: z.array(AgentGraphNodeSchema).min(1).max(MAX_GRAPH_NODES),
  })
  .strict();

export type AgentGraphNode = z.infer<typeof AgentGraphNodeSchema>;
export type AgentGraphSpec = z.infer<typeof AgentGraphSpecSchema>;

export type AgentGraphNodeStatus = "completed" | "failed" | "skipped";

export interface AgentGraphNodeResult {
  nodeId: string;
  status: AgentGraphNodeStatus;
  /** Agent output text (empty when failed/skipped). */
  output: string;
  /** Sanitized failure/skip reason. */
  reason?: string;
  durationMs: number;
  model?: string;
}

export interface AgentGraphRunResult {
  /** Combined output of the graph's output (sink) nodes. */
  output: string;
  /** Shared state at the end of the run, keyed by node id. */
  state: Record<string, AgentGraphNodeResult>;
  /** Execution waves in scheduling order (node ids). */
  waves: string[][];
  /** Ids of the nodes whose outputs form `output`. */
  outputNodeIds: string[];
  durationMs: number;
}

export interface AgentGraphMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Dependency-injected model invocation seam. Implementations route through
 * OmniRoute's own chat pipeline (HTTP self-call or an injected
 * HandleSingleModel-style closure) — the engine itself never talks to a
 * provider and never sees credentials.
 */
export type AgentInvoke = (options: {
  nodeId: string;
  model?: string;
  messages: AgentGraphMessage[];
}) => Promise<string>;

export interface AgentGraphValidation {
  ok: boolean;
  errors: string[];
  /** Topological execution waves (only meaningful when ok). */
  waves: string[][];
  edgeCount: number;
}
