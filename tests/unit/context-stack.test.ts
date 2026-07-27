import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "omniroute-context-stack-"));
process.env.DATA_DIR = TEST_DATA_DIR;

const core = await import("../../src/lib/db/core.ts");
const { buildContextStack, formatContextSystemMessage, estimateContextTokens } =
  await import("../../src/lib/contextStack/builder.ts");
const bridge = await import("../../src/lib/contextStack/memoryBridge.ts");

async function drainSetImmediate(rounds = 3) {
  for (let i = 0; i < rounds; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

function resetDb() {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
}

test.after(async () => {
  await drainSetImmediate();
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
});

test("buildContextStack orders layers global → project → task regardless of input order", () => {
  const stack = buildContextStack({
    sections: [
      { layer: "task", title: "Goal", content: "Ship the feature" },
      { layer: "global", title: "Rules", content: "Never touch payments" },
      { layer: "project", title: "Conventions", content: "Use fetch, never axios" },
    ],
  });

  const globalIdx = stack.text.indexOf("## Global Context");
  const projectIdx = stack.text.indexOf("## Project Context");
  const taskIdx = stack.text.indexOf("## Task Context");
  assert.ok(globalIdx >= 0 && projectIdx > globalIdx && taskIdx > projectIdx);
  assert.deepEqual(stack.layerCounts, { global: 1, project: 1, task: 1 });
  assert.equal(stack.droppedSections.length, 0);
  assert.equal(stack.tokenEstimate, estimateContextTokens(stack.text));
});

test("buildContextStack drops task sections first under a token budget, never global", () => {
  const big = "x".repeat(4000);
  const stack = buildContextStack({
    sections: [
      { layer: "global", title: "Identity", content: "Small global rule" },
      { layer: "project", title: "Arch", content: big },
      { layer: "task", title: "State A", content: big },
      { layer: "task", title: "State B", content: big },
    ],
    maxTokens: 1200,
  });

  assert.ok(stack.droppedSections.length >= 1);
  // Task sections go first (from the end), then project; global always stays.
  assert.equal(stack.droppedSections[stack.droppedSections.length - 1]?.layer, "task");
  assert.ok(stack.sections.some((s) => s.layer === "global"));
  assert.ok(stack.tokenEstimate <= 1200);
});

test("formatContextSystemMessage explains layer precedence", () => {
  const stack = buildContextStack({
    sections: [{ layer: "global", title: "Rules", content: "Be safe" }],
  });
  const msg = formatContextSystemMessage(stack);
  assert.ok(msg.includes("Global rules always win"));
  assert.ok(msg.includes("Be safe"));
});

test("buildContextStack validates input with Zod", () => {
  assert.throws(() =>
    buildContextStack({
      sections: [{ layer: "cosmic" as unknown as "global", title: "Bad", content: "layer" }],
    })
  );
});

test("slugifyContextTitle and memory keys are stable and filesystem-safe", () => {
  assert.equal(bridge.slugifyContextTitle("Coding Rules & Style!"), "coding-rules-style");
  assert.equal(
    bridge.contextStackMemoryKey("global", "Coding Rules & Style!"),
    "context-stack:global:coding-rules-style"
  );
  assert.equal(bridge.slugifyContextTitle("!!!"), "untitled");
});

test("saveContextSection upserts and loadContextSections filters by layer", async () => {
  resetDb();

  await bridge.saveContextSection({
    apiKeyId: "test-owner",
    section: { layer: "global", title: "Identity", content: "You are the router assistant" },
  });
  await bridge.saveContextSection({
    apiKeyId: "test-owner",
    section: { layer: "project", title: "Conventions", content: "2 spaces, double quotes" },
  });
  // Same layer+title again — must UPSERT, not duplicate.
  await bridge.saveContextSection({
    apiKeyId: "test-owner",
    section: { layer: "global", title: "Identity", content: "You are the UPDATED assistant" },
  });
  await drainSetImmediate();

  const all = await bridge.loadContextSections({ apiKeyId: "test-owner" });
  assert.equal(all.length, 2);
  assert.equal(all[0].layer, "global");
  assert.equal(all[0].content, "You are the UPDATED assistant");
  assert.equal(all[1].layer, "project");

  const globalsOnly = await bridge.loadContextSections({
    apiKeyId: "test-owner",
    layers: ["global"],
  });
  assert.equal(globalsOnly.length, 1);
  assert.equal(globalsOnly[0].title, "Identity");

  // Other owners see nothing.
  const other = await bridge.loadContextSections({ apiKeyId: "someone-else" });
  assert.equal(other.length, 0);
});

test("loaded sections round-trip through buildContextStack", async () => {
  resetDb();
  await bridge.saveContextSection({
    apiKeyId: "round-trip",
    section: { layer: "global", title: "Rules", content: "Rule one" },
  });
  await drainSetImmediate();

  const sections = await bridge.loadContextSections({ apiKeyId: "round-trip" });
  const stack = buildContextStack({
    sections: [...sections, { layer: "task", title: "Now", content: "Do the thing" }],
  });
  assert.ok(stack.text.includes("Rule one"));
  assert.ok(stack.text.includes("Do the thing"));
});
