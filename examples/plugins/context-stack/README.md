# Context Stack Plugin

Context engineering as a proxy-layer plugin: every chat request gets the
3-layer context stack injected before it reaches the provider.

| Layer   | Source                        | Behavior                                      |
| ------- | ----------------------------- | --------------------------------------------- |
| Global  | `globalContext` config        | Always present, never trimmed                 |
| Project | `projectContext` config       | Trimmed first when over the `maxChars` budget |
| Task    | The incoming request messages | Left untouched                                |

## Install

```bash
curl -X POST http://localhost:20128/api/plugins \
  -H "Content-Type: application/json" \
  -d '{"path": "/absolute/path/to/examples/plugins/context-stack"}'
curl -X POST http://localhost:20128/api/plugins/context-stack/activate
```

## Configure

```bash
curl -X PUT http://localhost:20128/api/plugins/context-stack/config \
  -H "Content-Type: application/json" \
  -d '{
    "globalContext": "You are the payments-team assistant. Never touch src/payments/ without approval.",
    "projectContext": "Monorepo: Next.js frontend + Express API. Use fetch, never axios. Vitest for tests."
  }'
```

Only the OpenAI chat-completions `messages` format is rewritten; other formats
pass through untouched. If the request already has a leading system message,
the stack is prepended to it.
