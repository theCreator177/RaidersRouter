import { z } from "zod";
import { AgentGraphSpecSchema } from "@/lib/agentGraph/types";
import { executeAgentGraph, validateAgentGraph } from "@/lib/agentGraph/engine";
import { planAgentGraph } from "@/lib/agentGraph/planner";
import { createLoopbackAgentInvoke } from "@/lib/agentGraph/invoke";
import { ContextSectionSchema, CONTEXT_LAYER_ORDER } from "@/lib/contextStack/types";
import { buildContextStack, formatContextSystemMessage } from "@/lib/contextStack/builder";
import { loadContextSections, saveContextSection } from "@/lib/contextStack/memoryBridge";
import type { ContextLayerKind } from "@/lib/contextStack/types";

/**
 * MCP tools for graph engineering (plan/validate/run an agent graph) and the
 * context engineering stack (build/save/load layered context). Graph node
 * calls run through the loopback chat pipeline with skill/memory injection
 * disabled (recursion guard) — see src/lib/agentGraph/invoke.ts.
 */

export const AgentGraphPlanSchema = z.object({
  prompt: z.string().min(1).max(100_000),
  plannerModel: z.string().min(1).max(200).optional(),
  maxNodes: z.number().int().min(2).max(40).optional(),
});

export const AgentGraphValidateSchema = z.object({
  graph: AgentGraphSpecSchema,
});

export const AgentGraphRunSchema = z.object({
  prompt: z.string().min(1).max(100_000),
  graph: AgentGraphSpecSchema.optional(),
  model: z.string().min(1).max(200).optional(),
  plannerModel: z.string().min(1).max(200).optional(),
  maxNodes: z.number().int().min(2).max(40).optional(),
});

export const ContextStackBuildSchema = z.object({
  sections: z.array(ContextSectionSchema).min(1).max(100),
  maxTokens: z.number().int().positive().max(1_000_000).optional(),
});

export const ContextStackSaveSchema = z.object({
  apiKeyId: z.string().min(1),
  sessionId: z.string().optional(),
  sections: z.array(ContextSectionSchema).min(1).max(100),
});

export const ContextStackLoadSchema = z.object({
  apiKeyId: z.string().min(1),
  layers: z.array(z.enum(CONTEXT_LAYER_ORDER)).optional(),
  limit: z.number().int().positive().max(500).optional(),
});

export const graphContextTools = {
  omniroute_agent_graph_plan: {
    name: "omniroute_agent_graph_plan",
    description:
      "Generate a multi-agent graph spec (nodes + connections) from a single prompt using a planner model",
    scopes: ["execute:agent-graph"],
    inputSchema: AgentGraphPlanSchema,
    handler: async (args: z.infer<typeof AgentGraphPlanSchema>) => {
      const invoke = createLoopbackAgentInvoke({ defaultModel: args.plannerModel || "auto" });
      const graph = await planAgentGraph({
        prompt: args.prompt,
        invoke,
        plannerModel: args.plannerModel,
        maxNodes: args.maxNodes,
      });
      const validation = validateAgentGraph(graph);
      return {
        success: true,
        data: {
          graph,
          nodeCount: graph.nodes.length,
          edgeCount: validation.edgeCount,
          waves: validation.waves,
        },
      };
    },
  },

  omniroute_agent_graph_validate: {
    name: "omniroute_agent_graph_validate",
    description:
      "Validate an agent graph spec (duplicate ids, unknown edges, cycles, caps) and return its execution waves",
    scopes: ["read:agent-graph"],
    inputSchema: AgentGraphValidateSchema,
    handler: async (args: z.infer<typeof AgentGraphValidateSchema>) => {
      const validation = validateAgentGraph(args.graph);
      return {
        success: validation.ok,
        data: {
          ok: validation.ok,
          errors: validation.errors,
          waves: validation.waves,
          edgeCount: validation.edgeCount,
        },
      };
    },
  },

  omniroute_agent_graph_run: {
    name: "omniroute_agent_graph_run",
    description:
      "Execute an agent graph against a task: plans the graph when none is given, runs nodes in parallel waves with shared state, and returns the synthesized output",
    scopes: ["execute:agent-graph"],
    inputSchema: AgentGraphRunSchema,
    handler: async (args: z.infer<typeof AgentGraphRunSchema>) => {
      const invoke = createLoopbackAgentInvoke({ defaultModel: args.model || "auto" });
      const graph =
        args.graph ??
        (await planAgentGraph({
          prompt: args.prompt,
          invoke,
          plannerModel: args.plannerModel,
          maxNodes: args.maxNodes,
        }));
      if (args.graph) {
        const validation = validateAgentGraph(args.graph);
        if (!validation.ok) {
          throw new Error(`Invalid agent graph: ${validation.errors.join("; ")}`);
        }
      }

      const runInvoke = createLoopbackAgentInvoke({
        defaultModel: args.model || "auto",
        graphName: graph.name,
      });
      const run = await executeAgentGraph({
        spec: graph,
        task: args.prompt,
        invoke: runInvoke,
        defaultModel: args.model,
      });
      return {
        success: true,
        data: {
          graph: graph.name,
          output: run.output,
          waves: run.waves,
          outputNodeIds: run.outputNodeIds,
          nodeStatus: Object.fromEntries(
            Object.entries(run.state).map(([id, r]) => [id, r.status])
          ),
          durationMs: run.durationMs,
        },
      };
    },
  },

  omniroute_context_stack_build: {
    name: "omniroute_context_stack_build",
    description:
      "Assemble the 3-layer context stack (global → project → task) with a token budget and return the rendered system-message text",
    scopes: ["read:context-stack"],
    inputSchema: ContextStackBuildSchema,
    handler: async (args: z.infer<typeof ContextStackBuildSchema>) => {
      const stack = buildContextStack({ sections: args.sections, maxTokens: args.maxTokens });
      return {
        success: true,
        data: {
          text: formatContextSystemMessage(stack),
          tokenEstimate: stack.tokenEstimate,
          layerCounts: stack.layerCounts,
          droppedSections: stack.droppedSections.map((s) => `${s.layer}:${s.title}`),
        },
      };
    },
  },

  omniroute_context_stack_save: {
    name: "omniroute_context_stack_save",
    description:
      "Persist context stack sections through the memory subsystem so they survive between sessions",
    scopes: ["write:context-stack"],
    inputSchema: ContextStackSaveSchema,
    handler: async (args: z.infer<typeof ContextStackSaveSchema>) => {
      const saved: string[] = [];
      for (const section of args.sections) {
        const memory = await saveContextSection({
          apiKeyId: args.apiKeyId,
          sessionId: args.sessionId,
          section,
        });
        saved.push(memory.key);
      }
      return {
        success: true,
        data: { savedKeys: saved, count: saved.length },
      };
    },
  },

  omniroute_context_stack_load: {
    name: "omniroute_context_stack_load",
    description: "Load persisted context stack sections (optionally filtered by layer)",
    scopes: ["read:context-stack"],
    inputSchema: ContextStackLoadSchema,
    handler: async (args: z.infer<typeof ContextStackLoadSchema>) => {
      const sections = await loadContextSections({
        apiKeyId: args.apiKeyId,
        layers: args.layers as ContextLayerKind[] | undefined,
        limit: args.limit,
      });
      return {
        success: true,
        data: { sections, count: sections.length },
      };
    },
  },
};
