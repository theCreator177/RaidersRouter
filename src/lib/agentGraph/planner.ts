import {
  AgentGraphSpec,
  AgentGraphSpecSchema,
  AgentInvoke,
  DEFAULT_PLANNER_MAX_NODES,
  MAX_GRAPH_NODES,
} from "./types";
import { validateAgentGraph } from "./engine";

/**
 * Graph planner — "a single prompt generates the entire structure".
 *
 * A planner model receives the user's prompt and emits the whole graph spec
 * (agents + connections) as strict JSON. The output is Zod-validated and
 * structurally validated (cycles, unknown edges, caps); one retry feeds the
 * validation errors back to the planner before giving up.
 */

export function buildPlannerPrompt(prompt: string, maxNodes: number): string {
  return [
    "You are a multi-agent architecture planner. Design an agent graph that solves the task below.",
    "Respond with ONLY a JSON object (no markdown fences, no commentary) with this exact shape:",
    `{
  "name": "kebab-case-graph-name",
  "description": "one-sentence mission",
  "nodes": [
    { "id": "kebab-case-id", "role": "what this agent does", "dependsOn": ["other-id"], "isOutput": false }
  ]
}`,
    "Rules:",
    `- Between 2 and ${maxNodes} nodes.`,
    "- ids are lowercase alphanumeric with dashes; dependsOn only references earlier defined ids.",
    "- The graph must be acyclic. Independent nodes run in parallel.",
    "- Downstream agents receive the outputs of every node they depend on (shared state).",
    '- Mark exactly the final synthesis node(s) with "isOutput": true.',
    "",
    `Task: ${prompt}`,
  ].join("\n");
}

/**
 * Extracts the first balanced JSON object from model output, tolerating
 * markdown code fences and prose around it.
 */
export function extractJsonObject(text: string): string | null {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < candidate.length; i++) {
    const ch = candidate[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      if (inString) escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return candidate.slice(start, i + 1);
    }
  }
  return null;
}

function parseGraphSpec(raw: string): { spec?: AgentGraphSpec; errors: string[] } {
  const json = extractJsonObject(raw);
  if (!json) return { errors: ["Planner output did not contain a JSON object"] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { errors: ["Planner output was not valid JSON"] };
  }

  const result = AgentGraphSpecSchema.safeParse(parsed);
  if (!result.success) {
    return {
      errors: result.error.issues
        .slice(0, 10)
        .map((issue) => `${issue.path.join(".") || "spec"}: ${issue.message}`),
    };
  }

  const validation = validateAgentGraph(result.data);
  if (!validation.ok) return { errors: validation.errors };
  return { spec: result.data, errors: [] };
}

export interface PlanAgentGraphOptions {
  prompt: string;
  invoke: AgentInvoke;
  /** Model used for the planner call (falls back to the invoke default). */
  plannerModel?: string;
  maxNodes?: number;
}

export async function planAgentGraph(options: PlanAgentGraphOptions): Promise<AgentGraphSpec> {
  const maxNodes = Math.min(
    Math.max(2, options.maxNodes ?? DEFAULT_PLANNER_MAX_NODES),
    MAX_GRAPH_NODES
  );
  const basePrompt = buildPlannerPrompt(options.prompt, maxNodes);

  let lastErrors: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const content =
      attempt === 0
        ? basePrompt
        : `${basePrompt}\n\nYour previous attempt was rejected: ${lastErrors.join(
            "; "
          )}\nReturn corrected JSON only.`;

    const raw = await options.invoke({
      nodeId: "__planner__",
      model: options.plannerModel,
      messages: [{ role: "user", content }],
    });

    const { spec, errors } = parseGraphSpec(raw);
    if (spec) {
      if (spec.nodes.length > maxNodes) {
        lastErrors = [`Graph has ${spec.nodes.length} nodes (max ${maxNodes})`];
        continue;
      }
      return spec;
    }
    lastErrors = errors;
  }

  throw new Error(`Planner failed to produce a valid agent graph: ${lastErrors.join("; ")}`);
}
