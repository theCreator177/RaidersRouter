import {
  AssembledContextStack,
  ContextLayerKind,
  ContextSection,
  ContextStackInput,
  ContextStackInputSchema,
  CONTEXT_LAYER_ORDER,
} from "./types";

const LAYER_HEADINGS: Record<ContextLayerKind, string> = {
  global: "Global Context",
  project: "Project Context",
  task: "Task Context",
};

/** Same rough heuristic the memory subsystem uses (chars / 4). */
export function estimateContextTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function renderSection(section: ContextSection): string {
  const source = section.source ? ` (source: ${section.source})` : "";
  return `### ${section.title}${source}\n\n${section.content.trim()}`;
}

function renderStack(sections: ContextSection[]): string {
  const parts: string[] = [];
  for (const layer of CONTEXT_LAYER_ORDER) {
    const layerSections = sections.filter((s) => s.layer === layer);
    if (layerSections.length === 0) continue;
    parts.push(`## ${LAYER_HEADINGS[layer]}\n\n${layerSections.map(renderSection).join("\n\n")}`);
  }
  return parts.join("\n\n");
}

/**
 * Assembles the 3-layer context stack in fixed order (global → project →
 * task), preserving insertion order within each layer. When a token budget is
 * given, sections are dropped from the least-durable layers first (task, then
 * project) — the global layer is never dropped.
 */
export function buildContextStack(input: ContextStackInput): AssembledContextStack {
  const parsed = ContextStackInputSchema.parse(input);

  const ordered: ContextSection[] = CONTEXT_LAYER_ORDER.flatMap((layer) =>
    parsed.sections.filter((s) => s.layer === layer)
  );

  let included = [...ordered];
  const droppedSections: ContextSection[] = [];

  if (parsed.maxTokens) {
    const overBudget = () => estimateContextTokens(renderStack(included)) > parsed.maxTokens!;
    // Drop from the end of the task layer first, then project. Global stays.
    for (const layer of ["task", "project"] as const) {
      while (overBudget()) {
        const idx = included.map((s) => s.layer).lastIndexOf(layer);
        if (idx === -1) break;
        droppedSections.unshift(included[idx]);
        included = [...included.slice(0, idx), ...included.slice(idx + 1)];
      }
    }
  }

  const text = renderStack(included);
  const layerCounts = { global: 0, project: 0, task: 0 } as Record<ContextLayerKind, number>;
  for (const section of included) layerCounts[section.layer] += 1;

  return {
    text,
    sections: included,
    droppedSections,
    tokenEstimate: estimateContextTokens(text),
    layerCounts,
  };
}

/**
 * Renders the assembled stack as a system-message string ready to prepend to a
 * chat request.
 */
export function formatContextSystemMessage(stack: AssembledContextStack): string {
  return `You operate with the following layered context. Global rules always win over project conventions, which win over task details.\n\n${stack.text}`;
}
