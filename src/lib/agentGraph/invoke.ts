import { resolveOmniRouteBaseUrl } from "@/shared/utils/resolveOmniRouteBaseUrl";
import { AgentInvoke } from "./types";

/**
 * Loopback AgentInvoke: every graph node executes through OmniRoute's own
 * /v1/chat/completions pipeline, so combos, fallback, circuit breakers, and
 * policy checks all apply to each agent — the graph engine never sees
 * credentials.
 *
 * Node calls always send `x-omniroute-no-memory: true`: it disables memory AND
 * skill/tool injection for the internal request, which both keeps node prompts
 * byte-stable and prevents a graph-running skill from being re-injected into
 * its own node calls (recursion guard).
 */

export const DEFAULT_GRAPH_NODE_TIMEOUT_MS = 120_000;

export interface LoopbackInvokeOptions {
  /** Fallback model when a node has no explicit model ("auto" routes via Auto-Combo). */
  defaultModel?: string;
  timeoutMs?: number;
  /** Overrides OMNIROUTE_API_KEY for the internal request. */
  apiKey?: string;
  /** Test seam — defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /**
   * Graph label stamped into the request body as `x_agent_graph` so plugins
   * (e.g. agent-graph-trace) can observe per-node executions. Same custom
   * body-field pattern as the A2A smart-routing "x-combo" field.
   */
  graphName?: string;
}

export function extractChatText(payload: unknown): string {
  const raw = payload as {
    choices?: Array<{ message?: { content?: unknown } }>;
    content?: Array<{ type?: string; text?: string }>;
  } | null;
  const openAi = raw?.choices?.[0]?.message?.content;
  if (typeof openAi === "string" && openAi.trim()) return openAi;
  if (Array.isArray(raw?.content)) {
    const text = raw.content
      .filter((block) => block?.type === "text" && typeof block.text === "string")
      .map((block) => block.text)
      .join("\n");
    if (text.trim()) return text;
  }
  return "";
}

export function createLoopbackAgentInvoke(options: LoopbackInvokeOptions = {}): AgentInvoke {
  const baseUrl = resolveOmniRouteBaseUrl();
  const apiKey = options.apiKey ?? process.env.OMNIROUTE_API_KEY ?? "";
  const timeoutMs = options.timeoutMs ?? DEFAULT_GRAPH_NODE_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? fetch;

  return async ({ nodeId, model, messages }) => {
    const body: Record<string, unknown> = {
      model: model || options.defaultModel || "auto",
      messages,
      stream: false,
    };
    if (options.graphName) {
      body.x_agent_graph = { graph: options.graphName, node: nodeId };
    }

    const res = await fetchImpl(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-omniroute-no-memory": "true",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      // Upstream error bodies may carry provider internals — keep the surfaced
      // message to status only (Hard Rule #12).
      throw new Error(`Agent ${nodeId} call failed with status ${res.status}`);
    }

    const payload = await res.json().catch(() => null);
    const text = extractChatText(payload);
    if (!text.trim()) {
      throw new Error(`Agent ${nodeId} returned an empty response`);
    }
    return text;
  };
}
