/**
 * Agent Graph Trace Plugin — shared-state observability for agent graphs.
 *
 * Graph node executions carry an `x_agent_graph: { graph, node }` marker in
 * the request body (stamped by the loopback invoke helper). This plugin
 * appends one JSONL entry per node request/response to a per-graph trace
 * file, giving operators a continuously-updated view of the mesh.
 *
 * Runs in an isolated child process — results must be RETURNED, and the
 * onResponse payload may arrive wrapped as `{ ctx: {...ctx, response} }`.
 *
 * @module agent-graph-trace
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function resolveTraceDir(config) {
  const configured = typeof config.traceDir === "string" ? config.traceDir.trim() : "";
  return configured || join(tmpdir(), "omniroute-graph-traces");
}

function graphMarker(body) {
  const marker = body && typeof body === "object" ? body.x_agent_graph : undefined;
  if (!marker || typeof marker !== "object") return null;
  const graph = typeof marker.graph === "string" ? marker.graph : "";
  const node = typeof marker.node === "string" ? marker.node : "";
  if (!graph || !node) return null;
  // Trace files are named after the graph — keep it filesystem-safe.
  return { graph: graph.replace(/[^a-z0-9_-]/gi, "_").slice(0, 80), node };
}

function writeTrace(config, entry) {
  const dir = resolveTraceDir(config);
  mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, `graph-${entry.graph}.jsonl`), `${JSON.stringify(entry)}\n`, "utf8");
}

function extractPreview(response, maxChars) {
  if (maxChars <= 0 || !response || typeof response !== "object") return undefined;
  const content = response?.choices?.[0]?.message?.content;
  if (typeof content !== "string") return undefined;
  return content.length > maxChars ? `${content.slice(0, maxChars)}...` : content;
}

/**
 * onRequest hook — records the node dispatch.
 */
export function onRequest(ctx) {
  const config = ctx?.config || {};
  if (config.enabled === false) return;

  const marker = graphMarker(ctx?.body);
  if (!marker) return;

  try {
    writeTrace(config, {
      ts: new Date().toISOString(),
      event: "node_request",
      graph: marker.graph,
      node: marker.node,
      requestId: ctx.requestId,
      model: ctx.model,
      provider: ctx.provider,
    });
  } catch {
    // Tracing is best-effort — never block the request.
  }

  return { metadata: { agentGraphTraced: true, agentGraphNode: marker.node } };
}

/**
 * onResponse hook — records the node result with an output preview.
 */
export function onResponse(payload) {
  // Defensive unwrap: in-process callers pass {...ctx, response}; the child
  // loader wraps it as { ctx: {...ctx, response}, response: undefined }.
  const ctx = payload?.ctx ?? payload ?? {};
  const response = payload?.response ?? ctx?.response;
  const config = ctx?.config || {};
  if (config.enabled === false) return;

  const marker = graphMarker(ctx?.body);
  if (!marker) return;

  try {
    writeTrace(config, {
      ts: new Date().toISOString(),
      event: "node_response",
      graph: marker.graph,
      node: marker.node,
      requestId: ctx.requestId,
      model: ctx.model,
      provider: ctx.provider,
      outputPreview: extractPreview(response, Number(config.maxPreviewChars) || 400),
    });
  } catch {
    // Best-effort only.
  }
}
