/**
 * A2A Skill: Context Stack
 *
 * Builds (and optionally persists) the 3-layer context stack — global rules,
 * project knowledge, task state — assembled in fixed order with a token
 * budget. Layers persisted via the memory subsystem survive between sessions,
 * so an agent can load its accumulated context at session start and update it
 * at session end.
 */

import type { A2ATask, TaskArtifact } from "../taskManager";
import {
  ContextSection,
  ContextSectionSchema,
  ContextLayerKind,
  CONTEXT_LAYER_ORDER,
} from "@/lib/contextStack/types";
import { buildContextStack, formatContextSystemMessage } from "@/lib/contextStack/builder";
import { loadContextSections, saveContextSection } from "@/lib/contextStack/memoryBridge";
import { z } from "zod";

const DEFAULT_OWNER_ID = "a2a-context";

const ContextStackMetadataSchema = z
  .object({
    action: z.enum(["build", "save", "load"]).default("build"),
    sections: z.array(ContextSectionSchema).max(100).optional(),
    includeSaved: z.boolean().default(false),
    maxTokens: z.number().int().positive().optional(),
    apiKeyId: z.string().min(1).max(200).default(DEFAULT_OWNER_ID),
    layers: z.array(z.enum(CONTEXT_LAYER_ORDER)).optional(),
  })
  .passthrough();

export interface ContextStackResult {
  artifacts: TaskArtifact[];
  metadata: {
    action: string;
    section_count: number;
    dropped_count: number;
    token_estimate: number;
    layer_counts: Record<string, number>;
  };
}

function lastUserMessage(task: A2ATask): string {
  const messages = task.input.messages || [];
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user" && messages[i]?.content?.trim()) {
      return messages[i].content.trim();
    }
  }
  return "";
}

export async function executeContextStack(task: A2ATask): Promise<ContextStackResult> {
  const parsed = ContextStackMetadataSchema.safeParse(task.input.metadata || {});
  if (!parsed.success) {
    throw new Error("context-stack received invalid metadata");
  }
  const meta = parsed.data;

  if (meta.action === "save") {
    const sections = meta.sections || [];
    if (sections.length === 0) {
      throw new Error("context-stack save requires metadata.sections");
    }
    for (const section of sections) {
      await saveContextSection({ apiKeyId: meta.apiKeyId, section });
    }
    const layerCounts: Record<string, number> = { global: 0, project: 0, task: 0 };
    for (const section of sections) layerCounts[section.layer] += 1;
    return {
      artifacts: [
        {
          type: "text",
          content: `Saved ${sections.length} context section(s) for later sessions.`,
        },
      ],
      metadata: {
        action: "save",
        section_count: sections.length,
        dropped_count: 0,
        token_estimate: 0,
        layer_counts: layerCounts,
      },
    };
  }

  if (meta.action === "load") {
    const sections = await loadContextSections({
      apiKeyId: meta.apiKeyId,
      layers: meta.layers as ContextLayerKind[] | undefined,
    });
    const layerCounts: Record<string, number> = { global: 0, project: 0, task: 0 };
    for (const section of sections) layerCounts[section.layer] += 1;
    return {
      artifacts: [{ type: "json", content: JSON.stringify(sections, null, 2) }],
      metadata: {
        action: "load",
        section_count: sections.length,
        dropped_count: 0,
        token_estimate: 0,
        layer_counts: layerCounts,
      },
    };
  }

  // action === "build"
  const sections: ContextSection[] = [...(meta.sections || [])];
  if (meta.includeSaved) {
    const saved = await loadContextSections({
      apiKeyId: meta.apiKeyId,
      layers: meta.layers as ContextLayerKind[] | undefined,
    });
    sections.unshift(...saved);
  }

  const taskText = lastUserMessage(task);
  if (taskText) {
    sections.push({ layer: "task", title: "Current Task", content: taskText, source: "a2a" });
  }

  if (sections.length === 0) {
    throw new Error(
      "context-stack build requires metadata.sections, includeSaved, or a user message"
    );
  }

  const stack = buildContextStack({ sections, maxTokens: meta.maxTokens });

  return {
    artifacts: [
      { type: "text", content: formatContextSystemMessage(stack) },
      {
        type: "json",
        content: JSON.stringify(
          {
            layerCounts: stack.layerCounts,
            tokenEstimate: stack.tokenEstimate,
            dropped: stack.droppedSections.map((s) => `${s.layer}:${s.title}`),
          },
          null,
          2
        ),
      },
    ],
    metadata: {
      action: "build",
      section_count: stack.sections.length,
      dropped_count: stack.droppedSections.length,
      token_estimate: stack.tokenEstimate,
      layer_counts: stack.layerCounts,
    },
  };
}
