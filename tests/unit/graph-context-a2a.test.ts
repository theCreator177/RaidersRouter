import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "omniroute-graph-a2a-"));
process.env.DATA_DIR = TEST_DATA_DIR;

const { A2A_SKILL_HANDLERS } = await import("../../src/lib/a2a/taskExecution.ts");
const { executeGraphEngineering } = await import("../../src/lib/a2a/skills/graphEngineering.ts");
const { executeContextStack } = await import("../../src/lib/a2a/skills/contextStack.ts");
const core = await import("../../src/lib/db/core.ts");

import type { A2ATask } from "../../src/lib/a2a/taskManager.ts";

function buildTask(
  content: string,
  metadata: Record<string, unknown> = {},
  skill = "graph-engineering"
): A2ATask {
  const now = new Date().toISOString();
  return {
    id: "task-1",
    skill,
    state: "working",
    input: { skill, messages: [{ role: "user", content }], metadata },
    artifacts: [],
    events: [],
    metadata: {},
    createdAt: now,
    updatedAt: now,
    expiresAt: now,
  } as unknown as A2ATask;
}

const SIMPLE_GRAPH = {
  name: "two-step",
  nodes: [
    { id: "draft", role: "Draft an answer", dependsOn: [] },
    { id: "review", role: "Review and finalize", dependsOn: ["draft"], isOutput: true },
  ],
};

test.after(() => {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
});

test("both skills are registered in A2A_SKILL_HANDLERS", () => {
  assert.ok("graph-engineering" in A2A_SKILL_HANDLERS);
  assert.ok("context-stack" in A2A_SKILL_HANDLERS);
});

test("graph-engineering planOnly returns the provided graph without executing", async () => {
  const result = await executeGraphEngineering(
    buildTask("write a haiku", { graph: SIMPLE_GRAPH, planOnly: true })
  );
  assert.equal(result.metadata.plan_only, true);
  assert.equal(result.metadata.node_count, 2);
  assert.equal(result.metadata.edge_count, 1);
  assert.equal(result.artifacts[0].type, "json");
  const parsed = JSON.parse(result.artifacts[0].content);
  assert.equal(parsed.name, "two-step");
});

test("graph-engineering executes a provided graph through the chat pipeline", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    calls.push({ url: String(url), body });
    const marker = body.x_agent_graph as { node?: string } | undefined;
    return new Response(
      JSON.stringify({
        choices: [{ message: { role: "assistant", content: `answer-from-${marker?.node}` } }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }) as typeof fetch;

  try {
    const result = await executeGraphEngineering(
      buildTask("write a haiku", { graph: SIMPLE_GRAPH })
    );
    assert.equal(result.metadata.planned, false);
    assert.equal(result.metadata.node_status.draft, "completed");
    assert.equal(result.metadata.node_status.review, "completed");
    assert.equal(result.artifacts[0].content, "answer-from-review");
    assert.equal(calls.length, 2);
    for (const call of calls) {
      assert.ok(call.url.endsWith("/v1/chat/completions"));
      assert.equal(call.body.stream, false);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("graph-engineering rejects an empty task and an invalid graph", async () => {
  await assert.rejects(executeGraphEngineering(buildTask("   ")), /user message/);
  await assert.rejects(
    executeGraphEngineering(
      buildTask("task", {
        graph: { name: "bad", nodes: [{ id: "a", role: "A", dependsOn: ["a"] }] },
      })
    ),
    /Invalid agent graph|depends on itself/
  );
});

test("context-stack build assembles sections plus the task message", async () => {
  const result = await executeContextStack(
    buildTask(
      "Implement the export feature",
      {
        action: "build",
        sections: [
          { layer: "global", title: "Rules", content: "Never touch src/payments/" },
          { layer: "project", title: "Stack", content: "Next.js + Express monorepo" },
        ],
      },
      "context-stack"
    )
  );

  assert.equal(result.metadata.action, "build");
  assert.equal(result.metadata.section_count, 3);
  assert.equal(result.metadata.layer_counts.task, 1);
  const text = result.artifacts[0].content;
  assert.ok(text.indexOf("## Global Context") < text.indexOf("## Project Context"));
  assert.ok(text.includes("Implement the export feature"));
});

test("context-stack save + load round-trips through memory", async () => {
  core.resetDbInstance();
  const save = await executeContextStack(
    buildTask(
      "save these",
      {
        action: "save",
        apiKeyId: "a2a-test-owner",
        sections: [{ layer: "global", title: "Identity", content: "Router assistant" }],
      },
      "context-stack"
    )
  );
  assert.equal(save.metadata.section_count, 1);

  const load = await executeContextStack(
    buildTask("load", { action: "load", apiKeyId: "a2a-test-owner" }, "context-stack")
  );
  assert.equal(load.metadata.action, "load");
  assert.equal(load.metadata.section_count, 1);
  const sections = JSON.parse(load.artifacts[0].content);
  assert.equal(sections[0].title, "Identity");
});

test("context-stack build with nothing to assemble fails cleanly", async () => {
  await assert.rejects(
    executeContextStack(buildTask("", { action: "build" }, "context-stack")),
    /requires/
  );
});
