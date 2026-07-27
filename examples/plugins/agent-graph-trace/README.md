# Agent Graph Trace Plugin

Shared-state observability for agent graphs: every graph node execution
(marked by the `x_agent_graph` body field stamped by the loopback invoke
helper in `src/lib/agentGraph/invoke.ts`) is appended as a JSONL entry to a
per-graph trace file.

Entries look like:

```json
{"ts":"2026-07-27T12:00:00.000Z","event":"node_request","graph":"research-review","node":"researcher","requestId":"...","model":"auto"}
{"ts":"2026-07-27T12:00:04.100Z","event":"node_response","graph":"research-review","node":"researcher","outputPreview":"..."}
```

## Install

```bash
curl -X POST http://localhost:20128/api/plugins \
  -H "Content-Type: application/json" \
  -d '{"path": "/absolute/path/to/examples/plugins/agent-graph-trace"}'
curl -X POST http://localhost:20128/api/plugins/agent-graph-trace/activate
```

Trace files default to `<tmpdir>/omniroute-graph-traces/graph-<name>.jsonl`;
set `traceDir` in the plugin config to change the location. Tracing is
best-effort and never blocks or fails a request. Requires the `file-read` and
`file-write` plugin permissions.
