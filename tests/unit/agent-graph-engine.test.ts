import test from "node:test";
import assert from "node:assert/strict";

const { validateAgentGraph, executeAgentGraph } =
  await import("../../src/lib/agentGraph/engine.ts");
const { planAgentGraph, extractJsonObject, buildPlannerPrompt } =
  await import("../../src/lib/agentGraph/planner.ts");
const { createLoopbackAgentInvoke, extractChatText } =
  await import("../../src/lib/agentGraph/invoke.ts");
const { AgentGraphSpecSchema } = await import("../../src/lib/agentGraph/types.ts");

type Invocation = { nodeId: string; model?: string; content: string };

function makeSpec(nodes: Array<Record<string, unknown>>, name = "test-graph") {
  return AgentGraphSpecSchema.parse({ name, nodes });
}

test("validateAgentGraph accepts a valid DAG and computes waves", () => {
  const spec = makeSpec([
    { id: "research", role: "Research the topic" },
    { id: "outline", role: "Outline", dependsOn: ["research"] },
    { id: "facts", role: "Collect facts" },
    { id: "write", role: "Write", dependsOn: ["outline", "facts"], isOutput: true },
  ]);
  const result = validateAgentGraph(spec);
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.edgeCount, 3);
  assert.deepEqual(result.waves, [["research", "facts"], ["outline"], ["write"]]);
});

test("validateAgentGraph rejects cycles, unknown deps, self-deps, and duplicates", () => {
  const cyclic = makeSpec([
    { id: "a", role: "A", dependsOn: ["b"] },
    { id: "b", role: "B", dependsOn: ["a"] },
  ]);
  assert.equal(validateAgentGraph(cyclic).ok, false);
  assert.ok(validateAgentGraph(cyclic).errors.join(" ").includes("cycle"));

  const unknownDep = makeSpec([{ id: "a", role: "A", dependsOn: ["ghost"] }]);
  assert.ok(validateAgentGraph(unknownDep).errors.join(" ").includes("unknown node"));

  const selfDep = makeSpec([{ id: "a", role: "A", dependsOn: ["a"] }]);
  assert.ok(validateAgentGraph(selfDep).errors.join(" ").includes("depends on itself"));

  const dup = makeSpec([
    { id: "a", role: "A" },
    { id: "a", role: "A again" },
  ]);
  assert.ok(validateAgentGraph(dup).errors.join(" ").includes("Duplicate"));
});

test("executeAgentGraph runs independent nodes in parallel waves and threads shared state", async () => {
  const spec = makeSpec([
    { id: "left", role: "Left branch" },
    { id: "right", role: "Right branch" },
    { id: "merge", role: "Merge", dependsOn: ["left", "right"] },
  ]);

  const invocations: Invocation[] = [];
  const inFlight = new Set<string>();
  let maxConcurrent = 0;

  const run = await executeAgentGraph({
    spec,
    task: "solve the task",
    invoke: async ({ nodeId, model, messages }) => {
      inFlight.add(nodeId);
      maxConcurrent = Math.max(maxConcurrent, inFlight.size);
      await new Promise((resolve) => setTimeout(resolve, 10));
      inFlight.delete(nodeId);
      invocations.push({ nodeId, model, content: messages.map((m) => m.content).join("\n") });
      return `output-of-${nodeId}`;
    },
  });

  // Both first-wave nodes were in flight at the same time.
  assert.equal(maxConcurrent, 2);
  assert.deepEqual(run.waves, [["left", "right"], ["merge"]]);

  // The merge node saw both upstream outputs through the shared state.
  const merge = invocations.find((i) => i.nodeId === "merge");
  assert.ok(merge);
  assert.ok(merge.content.includes("output-of-left"));
  assert.ok(merge.content.includes("output-of-right"));

  // Sink node is the output by default.
  assert.deepEqual(run.outputNodeIds, ["merge"]);
  assert.equal(run.output, "output-of-merge");
  assert.equal(run.state.left.status, "completed");
});

test("executeAgentGraph skips dependents of a failed node but keeps surviving branches", async () => {
  const spec = makeSpec([
    { id: "ok", role: "Works", isOutput: true },
    { id: "broken", role: "Fails" },
    { id: "downstream", role: "Depends on broken", dependsOn: ["broken"] },
  ]);

  const run = await executeAgentGraph({
    spec,
    task: "task",
    invoke: async ({ nodeId }) => {
      if (nodeId === "broken") throw new Error("upstream exploded");
      return `${nodeId}-done`;
    },
  });

  assert.equal(run.state.broken.status, "failed");
  assert.equal(run.state.downstream.status, "skipped");
  assert.ok(run.state.downstream.reason?.includes("broken"));
  assert.equal(run.output, "ok-done");
});

test("executeAgentGraph throws when every output node fails", async () => {
  const spec = makeSpec([{ id: "only", role: "Fails", isOutput: true }]);
  await assert.rejects(
    executeAgentGraph({
      spec,
      task: "task",
      invoke: async () => {
        throw new Error("boom");
      },
    }),
    /no output/
  );
});

test("executeAgentGraph joins multiple output nodes with headings", async () => {
  const spec = makeSpec([
    { id: "one", role: "First", isOutput: true },
    { id: "two", role: "Second", isOutput: true },
  ]);
  const run = await executeAgentGraph({
    spec,
    task: "task",
    invoke: async ({ nodeId }) => `${nodeId}-answer`,
  });
  assert.ok(run.output.includes("## one"));
  assert.ok(run.output.includes("## two"));
});

test("extractJsonObject handles fences, prose, and nested strings", () => {
  assert.equal(extractJsonObject('```json\n{"a":1}\n```'), '{"a":1}');
  assert.equal(extractJsonObject('noise before {"a":{"b":"}"}} noise after'), '{"a":{"b":"}"}}');
  assert.equal(extractJsonObject("no json here"), null);
  assert.equal(extractJsonObject(""), null);
});

test("planAgentGraph returns a validated spec from planner output", async () => {
  const graph = {
    name: "planned-graph",
    description: "test",
    nodes: [
      { id: "a", role: "First", dependsOn: [] },
      { id: "b", role: "Second", dependsOn: ["a"], isOutput: true },
    ],
  };
  const spec = await planAgentGraph({
    prompt: "build me a thing",
    invoke: async ({ nodeId, messages }) => {
      assert.equal(nodeId, "__planner__");
      assert.ok(messages[0].content.includes("build me a thing"));
      return `Here you go:\n\`\`\`json\n${JSON.stringify(graph)}\n\`\`\``;
    },
  });
  assert.equal(spec.name, "planned-graph");
  assert.equal(spec.nodes.length, 2);
});

test("planAgentGraph retries once with validation feedback, then succeeds", async () => {
  const good = {
    name: "fixed",
    nodes: [{ id: "solo", role: "Do it", dependsOn: [], isOutput: true }],
  };
  let calls = 0;
  const spec = await planAgentGraph({
    prompt: "task",
    invoke: async ({ messages }) => {
      calls += 1;
      if (calls === 1)
        return '{"name":"bad","nodes":[{"id":"x","role":"X","dependsOn":["ghost"]}]}';
      assert.ok(messages[0].content.includes("rejected"));
      return JSON.stringify(good);
    },
  });
  assert.equal(calls, 2);
  assert.equal(spec.name, "fixed");
});

test("planAgentGraph gives up after two invalid attempts", async () => {
  await assert.rejects(
    planAgentGraph({ prompt: "task", invoke: async () => "not json at all" }),
    /Planner failed/
  );
});

test("buildPlannerPrompt embeds the node budget", () => {
  const prompt = buildPlannerPrompt("do things", 7);
  assert.ok(prompt.includes("Between 2 and 7 nodes"));
  assert.ok(prompt.includes("do things"));
});

test("createLoopbackAgentInvoke sends the no-memory header and graph marker", async () => {
  const seen: Array<{ url: string; init: RequestInit }> = [];
  const invoke = createLoopbackAgentInvoke({
    defaultModel: "auto",
    graphName: "traced-graph",
    fetchImpl: (async (url: string | URL | Request, init?: RequestInit) => {
      seen.push({ url: String(url), init: init ?? {} });
      return new Response(
        JSON.stringify({ choices: [{ message: { role: "assistant", content: "hi" } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch,
  });

  const text = await invoke({ nodeId: "n1", messages: [{ role: "user", content: "hello" }] });
  assert.equal(text, "hi");
  assert.equal(seen.length, 1);
  assert.ok(seen[0].url.endsWith("/v1/chat/completions"));
  const headers = seen[0].init.headers as Record<string, string>;
  assert.equal(headers["x-omniroute-no-memory"], "true");
  const body = JSON.parse(String(seen[0].init.body));
  assert.equal(body.stream, false);
  assert.deepEqual(body.x_agent_graph, { graph: "traced-graph", node: "n1" });
});

test("createLoopbackAgentInvoke surfaces status-only errors and rejects empty output", async () => {
  const failing = createLoopbackAgentInvoke({
    fetchImpl: (async () =>
      new Response("secret provider internals", { status: 502 })) as typeof fetch,
  });
  await assert.rejects(
    failing({ nodeId: "n1", messages: [{ role: "user", content: "x" }] }),
    (err: Error) => {
      assert.ok(err.message.includes("502"));
      assert.ok(!err.message.includes("secret"));
      return true;
    }
  );

  const empty = createLoopbackAgentInvoke({
    fetchImpl: (async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "" } }] }), {
        status: 200,
      })) as typeof fetch,
  });
  await assert.rejects(
    empty({ nodeId: "n2", messages: [{ role: "user", content: "x" }] }),
    /empty response/
  );
});

test("extractChatText reads OpenAI and Claude formats", () => {
  assert.equal(extractChatText({ choices: [{ message: { content: "openai" } }] }), "openai");
  assert.equal(extractChatText({ content: [{ type: "text", text: "claude" }] }), "claude");
  assert.equal(extractChatText({}), "");
  assert.equal(extractChatText(null), "");
});
