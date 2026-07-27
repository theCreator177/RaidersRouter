import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "omniroute-graph-skills-"));
process.env.DATA_DIR = TEST_DATA_DIR;

const {
  graphEngineeringSkills,
  registerGraphEngineeringSkills,
  agentGraphRunSkill,
  contextStackBuildSkill,
} = await import("../../src/lib/skills/builtin/graphEngineering.ts");
const core = await import("../../src/lib/db/core.ts");

const CONTEXT = { apiKeyId: "skill-owner", sessionId: "session-1" };

test.after(() => {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
});

test("graphEngineeringSkills exposes both handlers and registers them", () => {
  assert.deepEqual(Object.keys(graphEngineeringSkills).sort(), [
    "agent_graph_run",
    "context_stack_build",
  ]);

  const registered: string[] = [];
  registerGraphEngineeringSkills({
    registerHandler: (name) => {
      registered.push(name);
    },
  });
  assert.deepEqual(registered.sort(), ["agent_graph_run", "context_stack_build"]);
});

test("agent_graph_run executes a provided graph via the loopback pipeline", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { x_agent_graph?: { node?: string } };
    return new Response(
      JSON.stringify({
        choices: [
          { message: { role: "assistant", content: `done-${body.x_agent_graph?.node ?? "?"}` } },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }) as typeof fetch;

  try {
    const result = await agentGraphRunSkill(
      {
        prompt: "summarize the report",
        graph: {
          name: "mini",
          nodes: [{ id: "solo", role: "Do everything", dependsOn: [], isOutput: true }],
        },
      },
      CONTEXT
    );
    assert.equal(result.success, true);
    assert.equal(result.graph, "mini");
    assert.equal(result.output, "done-solo");
    assert.deepEqual(result.nodeStatus, { solo: "completed" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("agent_graph_run rejects invalid input without leaking internals", async () => {
  await assert.rejects(agentGraphRunSkill({}, CONTEXT), /invalid input/);
});

test("context_stack_build assembles provided sections", async () => {
  const result = await contextStackBuildSkill(
    {
      sections: [
        { layer: "global", title: "Rules", content: "Hard rule" },
        { layer: "task", title: "Goal", content: "Finish it" },
      ],
    },
    CONTEXT
  );
  assert.equal(result.success, true);
  assert.ok(String(result.text).includes("Hard rule"));
  assert.deepEqual(result.layerCounts, { global: 1, project: 0, task: 1 });
});

test("context_stack_build fails when there is nothing to assemble", async () => {
  await assert.rejects(contextStackBuildSkill({}, CONTEXT), /no sections/);
});
