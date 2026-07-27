import { SkillHandler } from "../types";
import { AgentGraphSpecSchema } from "@/lib/agentGraph/types";
import { executeAgentGraph, validateAgentGraph } from "@/lib/agentGraph/engine";
import { planAgentGraph } from "@/lib/agentGraph/planner";
import { createLoopbackAgentInvoke } from "@/lib/agentGraph/invoke";
import { ContextSectionSchema, ContextLayerKind } from "@/lib/contextStack/types";
import { buildContextStack, formatContextSystemMessage } from "@/lib/contextStack/builder";
import { loadContextSections } from "@/lib/contextStack/memoryBridge";
import { z } from "zod";

/**
 * Runtime skill handlers for graph engineering + context stack.
 *
 * Registered at boot next to registerBuiltinSkills; a DB skill row whose
 * `handler` column names one of these keys makes it invocable through the
 * skills framework (injection advertises it, interception executes it).
 *
 * Node calls made by `agent_graph_run` go through the loopback pipeline with
 * the `x-omniroute-no-memory` header, which disables skill injection for those
 * internal requests — a node's model cannot recursively trigger this skill.
 */

const AgentGraphRunInputSchema = z.object({
  prompt: z.string().min(1).max(100_000),
  graph: AgentGraphSpecSchema.optional(),
  model: z.string().min(1).max(200).optional(),
  plannerModel: z.string().min(1).max(200).optional(),
  maxNodes: z.number().int().min(2).max(40).optional(),
});

export const agentGraphRunSkill: SkillHandler = async (input, context) => {
  const parsed = AgentGraphRunInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error("agent_graph_run: invalid input (requires prompt; optional graph/model)");
  }
  const { prompt, graph, model, plannerModel, maxNodes } = parsed.data;

  const invoke = createLoopbackAgentInvoke({ defaultModel: model || "auto" });
  const spec = graph ?? (await planAgentGraph({ prompt, invoke, plannerModel, maxNodes }));
  if (graph) {
    const validation = validateAgentGraph(graph);
    if (!validation.ok) {
      throw new Error(`agent_graph_run: invalid graph: ${validation.errors.join("; ")}`);
    }
  }

  const runInvoke = createLoopbackAgentInvoke({
    defaultModel: model || "auto",
    graphName: spec.name,
  });
  const run = await executeAgentGraph({
    spec,
    task: prompt,
    invoke: runInvoke,
    defaultModel: model,
  });
  return {
    success: true,
    context: context.apiKeyId,
    graph: spec.name,
    output: run.output,
    waves: run.waves,
    nodeStatus: Object.fromEntries(Object.entries(run.state).map(([id, r]) => [id, r.status])),
    durationMs: run.durationMs,
  };
};

const ContextStackBuildInputSchema = z.object({
  sections: z.array(ContextSectionSchema).max(100).optional(),
  includeSaved: z.boolean().optional(),
  maxTokens: z.number().int().positive().optional(),
  layers: z.array(z.enum(["global", "project", "task"])).optional(),
});

export const contextStackBuildSkill: SkillHandler = async (input, context) => {
  const parsed = ContextStackBuildInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error("context_stack_build: invalid input");
  }
  const { sections = [], includeSaved, maxTokens, layers } = parsed.data;

  const all = [...sections];
  if (includeSaved) {
    const saved = await loadContextSections({
      apiKeyId: context.apiKeyId,
      layers: layers as ContextLayerKind[] | undefined,
    });
    all.unshift(...saved);
  }
  if (all.length === 0) {
    throw new Error("context_stack_build: no sections provided and none saved");
  }

  const stack = buildContextStack({ sections: all, maxTokens });
  return {
    success: true,
    context: context.apiKeyId,
    text: formatContextSystemMessage(stack),
    tokenEstimate: stack.tokenEstimate,
    layerCounts: stack.layerCounts,
    droppedSections: stack.droppedSections.map((s) => `${s.layer}:${s.title}`),
  };
};

export const graphEngineeringSkills: Record<string, SkillHandler> = {
  agent_graph_run: agentGraphRunSkill,
  context_stack_build: contextStackBuildSkill,
};

export function registerGraphEngineeringSkills(executor: {
  registerHandler: (name: string, handler: SkillHandler) => void;
}): void {
  for (const [name, handler] of Object.entries(graphEngineeringSkills)) {
    executor.registerHandler(name, handler);
  }
}
