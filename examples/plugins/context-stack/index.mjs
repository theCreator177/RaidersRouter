/**
 * Context Stack Plugin — context engineering as a request hook.
 *
 * Implements the 3-layer context model at the proxy layer: the global and
 * project layers come from the plugin config and are injected as a leading
 * system message on every chat request; the task layer is the incoming
 * conversation itself, which is left untouched. Layer order is fixed:
 * global rules win over project conventions, which win over task details.
 *
 * Runs in an isolated child process — the hook must RETURN the rewritten
 * body; mutating ctx does not propagate.
 *
 * @module context-stack
 */

function buildStackText(globalContext, projectContext, maxChars) {
  const parts = [];
  if (globalContext && globalContext.trim()) {
    parts.push(`## Global Context\n\n${globalContext.trim()}`);
  }
  let project = projectContext && projectContext.trim() ? projectContext.trim() : "";
  if (project) {
    const globalLen = parts.length > 0 ? parts[0].length : 0;
    const budget = Math.max(0, maxChars - globalLen - 64);
    if (project.length > budget) {
      // The project layer is trimmed first; the global layer is never dropped.
      project = project.slice(0, budget);
    }
    if (project) parts.push(`## Project Context\n\n${project}`);
  }
  if (parts.length === 0) return "";
  return (
    "You operate with the following layered context. Global rules always win over " +
    "project conventions, which win over task details.\n\n" +
    parts.join("\n\n")
  );
}

/**
 * onRequest hook — prepends the context stack as a system message.
 */
export function onRequest(ctx) {
  const config = ctx?.config || {};
  if (config.enabled === false) return;

  const stackText = buildStackText(
    config.globalContext || "",
    config.projectContext || "",
    Number(config.maxChars) || 24000
  );
  if (!stackText) return;

  const body = ctx?.body;
  if (!body || typeof body !== "object" || !Array.isArray(body.messages)) {
    // Only the chat-completions message format is supported; leave other
    // formats (Responses API input, Gemini contents) untouched.
    return;
  }

  const messages = [...body.messages];
  if (messages.length > 0 && messages[0] && messages[0].role === "system") {
    messages[0] = {
      ...messages[0],
      content: `${stackText}\n\n${typeof messages[0].content === "string" ? messages[0].content : ""}`,
    };
  } else {
    messages.unshift({ role: "system", content: stackText });
  }

  return {
    body: { ...body, messages },
    metadata: { contextStackInjected: true, contextStackChars: stackText.length },
  };
}
