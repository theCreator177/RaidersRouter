import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");

const { validateManifest } = await import("../../src/lib/plugins/manifest.ts");

const CONTEXT_STACK_DIR = path.join(ROOT, "examples", "plugins", "context-stack");
const GRAPH_TRACE_DIR = path.join(ROOT, "examples", "plugins", "agent-graph-trace");

function loadManifest(dir: string) {
  return JSON.parse(fs.readFileSync(path.join(dir, "plugin.json"), "utf8"));
}

test("both example plugin manifests pass PluginManifestSchema", () => {
  for (const dir of [CONTEXT_STACK_DIR, GRAPH_TRACE_DIR]) {
    const manifest = validateManifest(loadManifest(dir));
    const entry = path.join(dir, manifest.main ?? "index.js");
    assert.ok(fs.existsSync(entry), `entry point missing for ${manifest.name}`);
  }
});

test("context-stack plugin injects a layered system message and returns the body", async () => {
  const plugin = await import(pathToFileURL(path.join(CONTEXT_STACK_DIR, "index.mjs")).href);
  const result = plugin.onRequest({
    requestId: "r1",
    model: "auto",
    provider: "openai",
    metadata: {},
    config: {
      globalContext: "Never touch payments.",
      projectContext: "Use fetch, never axios.",
    },
    body: { model: "auto", messages: [{ role: "user", content: "hi" }] },
  });

  assert.ok(result?.body);
  const messages = result.body.messages;
  assert.equal(messages[0].role, "system");
  assert.ok(
    messages[0].content.indexOf("## Global Context") <
      messages[0].content.indexOf("## Project Context")
  );
  assert.ok(messages[0].content.includes("Never touch payments."));
  assert.equal(messages[1].content, "hi");
  assert.equal(result.metadata.contextStackInjected, true);
});

test("context-stack plugin merges into an existing system message and skips non-chat bodies", async () => {
  const plugin = await import(pathToFileURL(path.join(CONTEXT_STACK_DIR, "index.mjs")).href);

  const merged = plugin.onRequest({
    config: { globalContext: "Rule." },
    body: {
      messages: [
        { role: "system", content: "existing system" },
        { role: "user", content: "hi" },
      ],
    },
  });
  assert.equal(merged.body.messages.length, 2);
  assert.ok(merged.body.messages[0].content.includes("Rule."));
  assert.ok(merged.body.messages[0].content.includes("existing system"));

  // Responses-API style body is left untouched.
  const skipped = plugin.onRequest({
    config: { globalContext: "Rule." },
    body: { input: "hello" },
  });
  assert.equal(skipped, undefined);

  // No configured context → no-op.
  const noop = plugin.onRequest({
    config: {},
    body: { messages: [{ role: "user", content: "hi" }] },
  });
  assert.equal(noop, undefined);
});

test("agent-graph-trace plugin records node request/response entries as JSONL", async () => {
  const plugin = await import(pathToFileURL(path.join(GRAPH_TRACE_DIR, "index.mjs")).href);
  const traceDir = fs.mkdtempSync(path.join(os.tmpdir(), "omniroute-graph-trace-"));

  try {
    const config = { traceDir, maxPreviewChars: 10 };
    const body = { x_agent_graph: { graph: "my-graph", node: "researcher" } };

    const reqResult = plugin.onRequest({
      requestId: "r1",
      model: "auto",
      provider: "openai",
      config,
      body,
    });
    assert.equal(reqResult.metadata.agentGraphNode, "researcher");

    // Child-loader wrapped payload shape ({ ctx: {...ctx, response} }).
    plugin.onResponse({
      ctx: {
        requestId: "r1",
        model: "auto",
        config,
        body,
        response: { choices: [{ message: { content: "a very long node output" } }] },
      },
      response: undefined,
    });

    const lines = fs
      .readFileSync(path.join(traceDir, "graph-my-graph.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.equal(lines.length, 2);
    assert.equal(lines[0].event, "node_request");
    assert.equal(lines[1].event, "node_response");
    assert.equal(lines[1].outputPreview, "a very lon...");

    // Requests without the marker are ignored.
    const ignored = plugin.onRequest({ config, body: { messages: [] } });
    assert.equal(ignored, undefined);
  } finally {
    fs.rmSync(traceDir, { recursive: true, force: true });
  }
});
