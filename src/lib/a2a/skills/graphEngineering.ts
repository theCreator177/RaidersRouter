/**
 * A2A Skill: Graph Engineering
 *
 * Deploys a graph of agents from a single prompt: a planner model generates
 * the whole graph structure (nodes + connections), then the engine executes it
 * in parallel waves with a shared state that every downstream agent reads.
 * Each node runs through OmniRoute's own chat pipeline, so routing, fallback,
 * and circuit breakers apply per agent.
 */

import type { A2ATask, TaskArtifact } from "../taskManager";
import { AgentGraphSpec, AgentGraphSpecSchema } from "@/lib/agentGraph/types";
import { executeAgentGraph, validateAgentGraph } from "@/lib/agentGraph/engine";
import { planAgentGraph } from "@/lib/agentGraph/planner";
import { createLoopbackAgentInvoke } from "@/lib/agentGraph/invoke";

export interface GraphEngineeringResult {
  artifacts: TaskArtifact[];
  metadata: {
    graph_name: string;
    node_count: number;
    edge_count: number;
    wave_count: number;
    planned: boolean;
    plan_only: boolean;
    node_status: Record<string, string>;
    duration_ms: number;
  };
}

function lastUserMessage(task: A2ATask): string {
  const messages = task.input.messages || [];
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user" && messages[i]?.content?.trim()) {
      return messages[i].content.trim();
    }
  }
  return "";
}

export async function executeGraphEngineering(task: A2ATask): Promise<GraphEngineeringResult> {
  const prompt = lastUserMessage(task);
  if (!prompt) {
    throw new Error("graph-engineering requires a user message describing the task");
  }

  const metadata = task.input.metadata || {};
  const defaultModel = typeof metadata.model === "string" ? metadata.model : "auto";
  const plannerModel =
    typeof metadata.plannerModel === "string" ? metadata.plannerModel : undefined;
  const maxNodes = typeof metadata.maxNodes === "number" ? metadata.maxNodes : undefined;
  const planOnly = metadata.planOnly === true;

  const invoke = createLoopbackAgentInvoke({ defaultModel });

  let spec: AgentGraphSpec;
  let planned = false;
  if (metadata.graph && typeof metadata.graph === "object") {
    spec = AgentGraphSpecSchema.parse(metadata.graph);
    const validation = validateAgentGraph(spec);
    if (!validation.ok) {
      throw new Error(`Invalid agent graph: ${validation.errors.join("; ")}`);
    }
  } else {
    spec = await planAgentGraph({ prompt, invoke, plannerModel, maxNodes });
    planned = true;
  }

  const validation = validateAgentGraph(spec);
  const edgeCount = validation.edgeCount;

  if (planOnly) {
    return {
      artifacts: [{ type: "json", content: JSON.stringify(spec, null, 2) }],
      metadata: {
        graph_name: spec.name,
        node_count: spec.nodes.length,
        edge_count: edgeCount,
        wave_count: validation.waves.length,
        planned,
        plan_only: true,
        node_status: {},
        duration_ms: 0,
      },
    };
  }

  const runInvoke = createLoopbackAgentInvoke({ defaultModel, graphName: spec.name });
  const run = await executeAgentGraph({ spec, task: prompt, invoke: runInvoke, defaultModel });

  const nodeStatus: Record<string, string> = {};
  for (const [nodeId, result] of Object.entries(run.state)) {
    nodeStatus[nodeId] = result.status;
  }

  return {
    artifacts: [
      { type: "text", content: run.output },
      {
        type: "json",
        content: JSON.stringify(
          { graph: spec, waves: run.waves, outputNodeIds: run.outputNodeIds },
          null,
          2
        ),
      },
    ],
    metadata: {
      graph_name: spec.name,
      node_count: spec.nodes.length,
      edge_count: edgeCount,
      wave_count: run.waves.length,
      planned,
      plan_only: false,
      node_status: nodeStatus,
      duration_ms: run.durationMs,
    },
  };
}
