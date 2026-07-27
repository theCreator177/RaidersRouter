import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  graphContextTools,
  AgentGraphValidateSchema,
  ContextStackBuildSchema,
} from "../tools/graphContextTools.ts";
import { createMcpServer } from "../server.ts";

vi.mock("../audit.ts", () => ({
  logToolCall: vi.fn().mockResolvedValue(undefined),
  closeAuditDb: vi.fn(),
}));

const TOOL_NAMES = [
  "omniroute_agent_graph_plan",
  "omniroute_agent_graph_validate",
  "omniroute_agent_graph_run",
  "omniroute_context_stack_build",
  "omniroute_context_stack_save",
  "omniroute_context_stack_load",
];

describe("graph/context MCP tool definitions", () => {
  it("exposes exactly the six expected tools", () => {
    expect(Object.keys(graphContextTools).sort()).toEqual([...TOOL_NAMES].sort());
    for (const [key, def] of Object.entries(graphContextTools)) {
      expect(def.name).toBe(key);
      expect(def.description.length).toBeGreaterThan(0);
      expect(def.scopes.length).toBeGreaterThan(0);
      expect(typeof def.handler).toBe("function");
    }
  });

  it("assigns the agent-graph and context-stack scopes", () => {
    expect(graphContextTools.omniroute_agent_graph_run.scopes).toContain("execute:agent-graph");
    expect(graphContextTools.omniroute_agent_graph_plan.scopes).toContain("execute:agent-graph");
    expect(graphContextTools.omniroute_agent_graph_validate.scopes).toContain("read:agent-graph");
    expect(graphContextTools.omniroute_context_stack_build.scopes).toContain("read:context-stack");
    expect(graphContextTools.omniroute_context_stack_save.scopes).toContain("write:context-stack");
    expect(graphContextTools.omniroute_context_stack_load.scopes).toContain("read:context-stack");
  });

  it("validates inputs with the exported Zod schemas", () => {
    expect(
      AgentGraphValidateSchema.safeParse({
        graph: { name: "g", nodes: [{ id: "a", role: "A", dependsOn: [] }] },
      }).success
    ).toBe(true);
    expect(AgentGraphValidateSchema.safeParse({}).success).toBe(false);
    expect(
      ContextStackBuildSchema.safeParse({
        sections: [{ layer: "global", title: "T", content: "C" }],
      }).success
    ).toBe(true);
    expect(ContextStackBuildSchema.safeParse({ sections: [] }).success).toBe(false);
  });

  it("validate handler reports cycles without throwing", async () => {
    const result = (await graphContextTools.omniroute_agent_graph_validate.handler({
      graph: {
        name: "cyclic",
        nodes: [
          { id: "a", role: "A", dependsOn: ["b"] },
          { id: "b", role: "B", dependsOn: ["a"] },
        ],
      },
    })) as { success: boolean; data: { ok: boolean; errors: string[] } };
    expect(result.success).toBe(false);
    expect(result.data.errors.join(" ")).toMatch(/cycle/);
  });

  it("build handler assembles the layered stack", async () => {
    const result = (await graphContextTools.omniroute_context_stack_build.handler({
      sections: [
        { layer: "task", title: "Goal", content: "Ship it" },
        { layer: "global", title: "Rules", content: "Stay safe" },
      ],
    })) as { success: boolean; data: { text: string; layerCounts: Record<string, number> } };
    expect(result.success).toBe(true);
    expect(result.data.text.indexOf("Stay safe")).toBeLessThan(result.data.text.indexOf("Ship it"));
    expect(result.data.layerCounts).toEqual({ global: 1, project: 0, task: 1 });
  });
});

describe("graph/context MCP tools registration", () => {
  let client: Client;

  beforeEach(async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createMcpServer();
    await server.connect(serverTransport);
    client = new Client({ name: "graph-context-tools-test", version: "1.0.0" });
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
  });

  it("appears in tools/list after registration", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    for (const name of TOOL_NAMES) {
      expect(names).toContain(name);
    }
  });
});
