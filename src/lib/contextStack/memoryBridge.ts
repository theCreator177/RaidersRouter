import { createMemory, listMemories } from "@/lib/memory/store";
import { MemoryType, Memory } from "@/lib/memory/types";
import { ContextLayerKind, ContextSection, CONTEXT_LAYER_ORDER } from "./types";

/**
 * Persistence bridge: context layers are stored through the existing memory
 * subsystem (SQLite + FTS5 + vector sync all come for free) instead of a new
 * table. Entries are namespaced with a key prefix and a metadata
 * discriminator, and UPSERT on (apiKeyId, key) — saving the same layer+title
 * updates it in place.
 */

export const CONTEXT_STACK_KEY_PREFIX = "context-stack:";
export const CONTEXT_STACK_SOURCE = "context-stack";

const LAYER_MEMORY_TYPE: Record<ContextLayerKind, MemoryType> = {
  // Global rules are "how to behave" → procedural; project knowledge is
  // semantic; task state is run-scoped → episodic.
  global: MemoryType.PROCEDURAL,
  project: MemoryType.SEMANTIC,
  task: MemoryType.EPISODIC,
};

export function slugifyContextTitle(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "untitled"
  );
}

export function contextStackMemoryKey(layer: ContextLayerKind, title: string): string {
  return `${CONTEXT_STACK_KEY_PREFIX}${layer}:${slugifyContextTitle(title)}`;
}

export interface SaveContextSectionOptions {
  apiKeyId: string;
  sessionId?: string;
  section: ContextSection;
  /** Optional TTL for task-layer state; global/project persist by default. */
  expiresAt?: Date | null;
}

export async function saveContextSection(options: SaveContextSectionOptions): Promise<Memory> {
  const { section } = options;
  return createMemory({
    apiKeyId: options.apiKeyId,
    sessionId: options.sessionId ?? "",
    type: LAYER_MEMORY_TYPE[section.layer],
    key: contextStackMemoryKey(section.layer, section.title),
    content: section.content,
    metadata: {
      source: CONTEXT_STACK_SOURCE,
      layer: section.layer,
      title: section.title,
      ...(section.source ? { provenance: section.source } : {}),
    },
    expiresAt: options.expiresAt ?? null,
  });
}

export interface LoadContextSectionsOptions {
  apiKeyId: string;
  /** Restrict to specific layers (default: all three). */
  layers?: ContextLayerKind[];
  limit?: number;
}

export async function loadContextSections(
  options: LoadContextSectionsOptions
): Promise<ContextSection[]> {
  const layers = options.layers?.length ? options.layers : [...CONTEXT_LAYER_ORDER];
  const { data } = await listMemories({
    apiKeyId: options.apiKeyId,
    limit: options.limit ?? 200,
  });

  const sections: ContextSection[] = [];
  for (const memory of data) {
    if (!memory.key.startsWith(CONTEXT_STACK_KEY_PREFIX)) continue;
    const layer = memory.metadata?.layer as ContextLayerKind | undefined;
    if (!layer || !layers.includes(layer)) continue;
    sections.push({
      layer,
      title:
        (memory.metadata?.title as string) || memory.key.slice(CONTEXT_STACK_KEY_PREFIX.length),
      content: memory.content,
      source: "memory",
    });
  }

  // Stable order: layer order first, then insertion (listMemories returns
  // newest first — reverse within layer so older foundations come first).
  return CONTEXT_LAYER_ORDER.flatMap((layer) =>
    sections.filter((s) => s.layer === layer).reverse()
  );
}
