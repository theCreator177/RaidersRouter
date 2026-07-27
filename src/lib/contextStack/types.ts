import { z } from "zod";

/**
 * Context Engineering Stack — the 3-layer context model.
 *
 * - global:  always-present identity, rules, and constraints
 * - project: codebase/domain knowledge (AGENTS.md-style conventions, decisions)
 * - task:    the immediate goal, files, and state for this one task
 *
 * The builder assembles the layers in that fixed order into a single context
 * block; the memory bridge persists layers through the existing memory
 * subsystem so they survive between sessions.
 */

export const CONTEXT_LAYER_ORDER = ["global", "project", "task"] as const;

export type ContextLayerKind = (typeof CONTEXT_LAYER_ORDER)[number];

export const MAX_CONTEXT_SECTION_CHARS = 100_000;
export const MAX_CONTEXT_SECTIONS = 100;

export const ContextSectionSchema = z
  .object({
    layer: z.enum(CONTEXT_LAYER_ORDER),
    title: z.string().min(1).max(200),
    content: z.string().min(1).max(MAX_CONTEXT_SECTION_CHARS),
    /** Provenance label, e.g. "AGENTS.md", "memory", "config". */
    source: z.string().max(200).optional(),
  })
  .strict();

export const ContextStackInputSchema = z
  .object({
    sections: z.array(ContextSectionSchema).min(1).max(MAX_CONTEXT_SECTIONS),
    /** Token budget for the assembled stack (estimate, chars/4). */
    maxTokens: z.number().int().positive().max(1_000_000).optional(),
  })
  .strict();

export type ContextSection = z.infer<typeof ContextSectionSchema>;
export type ContextStackInput = z.infer<typeof ContextStackInputSchema>;

export interface AssembledContextStack {
  /** The assembled context, ordered global → project → task. */
  text: string;
  /** Sections included, in final order. */
  sections: ContextSection[];
  /** Sections dropped to honor maxTokens (task first, then project). */
  droppedSections: ContextSection[];
  tokenEstimate: number;
  layerCounts: Record<ContextLayerKind, number>;
}
