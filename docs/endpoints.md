# Agent Office — Endpoints Reference

All HTTP endpoints are mounted under `/api/`. The WebSocket endpoint is at `/ws` (default `ws://host:port/`). The dashboard root is `/` serving `public/index.html`.

Base URL in production: `http://187.77.130.62:3000`. Local dev: `http://localhost:3000`.

---

## GET /api/health

Liveness check. Always returns 200 if the process is alive, even if a kanban DB is missing.

**Response 200**

```json
{
  "ok": true,
  "db": {
    "dev": true,
    "paper": true
  },
  "uptime": 1076.87
}
```

| Field | Type | Description |
|---|---|---|
| `ok` | boolean | Always `true` when the process responds |
| `db` | object | Per-team DB connection status; `true` = connected, `false` = missing/error |
| `uptime` | number | Process uptime in seconds |

---

## GET /api/teams

Returns the configured team list. Used by the frontend to render the team selector.

**Response 200**

```json
[
  { "id": "dev",   "name": "Dev Office"   },
  { "id": "paper", "name": "Paper Office" }
]
```

---

## GET /api/snapshot

Full snapshot for all teams. Powers the entire dashboard — the WS layer just rebroadcasts this on every delta.

**Response 200**

```json
{
  "dev": {
    "profiles": [ ... ],
    "tasks":    [ ... ],
    "events":   [ ... ],
    "comments": [ ... ],
    "runs":     [ ... ],
    "links":    [ ... ],
    "standup":  { ... },
    "serverTime": 1749842531842
  },
  "paper": { "...": "same shape" }
}
```

### Per-team shape

#### `profiles[]`

One entry per Hermes profile (auto-discovered from `~/.hermes/profiles/`). Enriched with config metadata and the latest heartbeat payload.

| Field | Type | Source | Description |
|---|---|---|---|
| `id` | string | profile dir name | e.g. `dev-lead`, `api-dev` |
| `name` | string | `NAME_OVERRIDES[id]` or auto-derived | Human-readable name |
| `model` | string | task-level `model_override` or profile default | Effective model for current task |
| `icon` | string | `ICON_OVERRIDES[id]` or auto-derived (first 3 chars uppercase) | Badge abbreviation |
| `status` | string `idle`/`running`/`blocked` | task status | Profile activity state |
| `currentTask` | string \| null | task title | Title of the active task |
| `currentTaskId` | string \| null | task id | ID of the active task |
| `currentCommand` | string \| null | `tasks.current_command` | Last heartbeat command |
| `currentProgress` | string \| null | `tasks.current_progress` | Last heartbeat progress text |
| `lastActivity` | number \| null | task_runs ended_at or started_at | Unix timestamp |
| `provider` | string \| null | `config.yaml` model.provider | Profile provider |
| `activeToolsets` | string[] | `config.yaml` toolsets | Configured toolsets |
| `disabledToolsets` | string[] | `config.yaml` agent.disabled_toolsets | Disabled toolsets |
| `maxTurns` | number \| null | `config.yaml` agent.max_turns | Configured turn cap |
| `goalMode` | boolean | `config.yaml` goals.max_turns > 0 | Whether goal-mode is on |
| `personality` | string \| null | `config.yaml` display.personality | Profile personality setting |
| `terminalBackend` | string \| null | `config.yaml` terminal.backend | Terminal backend type |
| `description` | string \| null | `profile.yaml` description | Profile description |
| `memoryEnabled` | boolean \| null | `config.yaml` memory.memory_enabled | Whether memory is on |
| `maxConcurrentChildren` | number \| null | `config.yaml` delegation.max_concurrent_children | Subagent cap |
| `maxSpawnDepth` | number \| null | `config.yaml` delegation.max_spawn_depth | Delegation depth |
| `reasoningEffort` | string \| null | `config.yaml` agent.reasoning_effort | Reasoning effort setting |
| `workspacePath` | string \| null | `tasks.workspace_path` | Current task workspace path |
| `progressPct` | number \| null | latest heartbeat `progressPct` | 0-100 |
| `currentSkill` | string \| null | latest heartbeat `skill` | Active skill name |
| `currentTool` | string \| null | latest heartbeat `toolCall` | Current tool name |
| `actionType` | string \| null | latest heartbeat `actionType` | `reading`/`writing`/etc |
| `terminalOutput` | string \| null | latest heartbeat `terminalOutput` (truncated 500 chars) | Last terminal lines |
| `fileEdited` | string \| null | latest heartbeat `fileEdited` | Absolute path of file being edited |
| `contextPct` | number \| null | latest heartbeat `contextPct` | Context window usage |
| `turnCount` | number \| null | latest heartbeat `turnCount` | Current turn |
| `sessionMaxTurns` | number \| null | latest heartbeat `maxTurns` | Session turn cap |
| `errorState` | string \| null | latest heartbeat `errorState` | Transient error text |
| `sessionDuration` | number \| null | latest heartbeat `sessionDuration` | Elapsed seconds |
| `subagentActive` | boolean \| null | latest heartbeat `subagentActive` | Subagents running |
| `memoryUpdated` | boolean \| null | latest heartbeat `memoryUpdated` | Memory updated this turn |
| `lastHeartbeatAt` | number \| null | `tasks.last_heartbeat_at` (unixepoch) | Server-set timestamp |

#### `tasks[]`

Most recent 200 tasks across all statuses, ordered by `created_at DESC`. Fields: `id, title, body, assignee, status, priority, tenant, created_at, started_at, completed_at, result, current_command, current_progress, model_override, workspace_path, last_heartbeat_at`.

#### `events[]`

Most recent 100 events. `kind='heartbeat'` rows are the live-data source for active tasks; the rest are status changes, completions, blocks, etc.

`payload` is a JSON-encoded string. Parse to access heartbeat fields.

#### `comments[]`

Most recent 50 comments. Rendered as chat bubbles in the agent chat panel.

#### `runs[]`

Most recent 50 task_runs rows. Powers the run history in the inspector.

#### `links[]`

All `task_links` rows (`parent_id`, `child_id`). Used for nested card rendering and dependency arrows.

#### `standup`

| Field | Type | Description |
|---|---|---|
| `totalTasks` | number | Count of tasks in the LIMIT-200 window |
| `byStatus` | object | Map of status → count |
| `byProfile` | object | Map of profile id → `{ running, blocked, todo }` counts |
| `blockers` | object[] | Tasks currently in `status='blocked'` (full task objects) |

#### `serverTime`

Unix timestamp (ms) when the snapshot was built. Useful for clock-skew detection.

---

## POST /api/agents/{profileId}/heartbeat

The only write endpoint. Called by Hermes kanban workers during task execution to report runtime state. Also called by the bridge cron (`bridge/heartbeat_bridge.py`) as a safety net.

**Path params**

| Param | Type | Description |
|---|---|---|
| `profileId` | string | Hermes profile id, e.g. `dev-lead`, `api-dev`, `paper-researcher` |

**Body (JSON)**

Required: `taskId`, `command`. All other fields are optional. Aliases (in parentheses) accepted for backward compatibility.

```json
{
  "taskId": "t_327cf48f",
  "command": "read_file /root/agent-office/server/routes.js",
  "progress": "Step 3 of 5 — updating buildSnapshot()",
  "progressPct": 60,
  "skill": "fastapi",
  "toolCall": "read_file",
  "actionType": "reading",
  "terminalOutput": "Last 3 lines of output...",
  "errorState": null,
  "fileEdited": "/root/agent-office/server/routes.js",
  "sessionDuration": 420,
  "model": "deepseek-v4-flash",
  "provider": "opencode-go",
  "contextPct": 64,
  "turnCount": 12,
  "maxTurns": 150,
  "subagentActive": false,
  "memoryUpdated": false
}
```

| Field | Type | Required | Alias | Description |
|---|---|---|---|---|
| `taskId` | string | yes | — | Kanban task id, e.g. `t_327cf48f` |
| `command` | string | yes | — | High-level current action |
| `progress` | string | no | — | Human-readable progress text |
| `progressPct` | integer 0-100 | no | `progressPercent` | Numeric completion % |
| `skill` | string | no | — | Active skill name |
| `toolCall` | string | no | `tool` | Tool currently invoked |
| `actionType` | string | no | — | Action category |
| `terminalOutput` | string (max 500 chars) | no | `outputSnippet` | Last N terminal lines; server truncates to 500 |
| `errorState` | string | no | `error` | Transient error text |
| `fileEdited` | string | no | — | Absolute file path being edited |
| `sessionDuration` | integer | no | — | Elapsed seconds since run start |
| `model` | string | no | — | Active model |
| `provider` | string | no | — | Active provider |
| `contextPct` | integer 0-100 | no | — | Context window usage |
| `turnCount` | integer | no | — | Current turn |
| `maxTurns` | integer | no | — | Max turns for session |
| `subagentActive` | boolean | no | — | Subagents currently running |
| `memoryUpdated` | boolean | no | — | Memory updated this turn |

**Response 200**

```json
{ "ok": true, "taskId": "t_327cf48f", "teamId": "dev" }
```

**Response 400** — missing required field

```json
{ "error": "taskId and command are required" }
```

**Response 404** — task not found in any team DB

```json
{ "error": "Task not found", "taskId": "t_nonexistent" }
```

**Side effects**

1. `UPDATE tasks SET current_command=?, current_progress=?, last_heartbeat_at=unixepoch() WHERE id=?`
2. `INSERT INTO task_events (task_id, kind, payload, created_at) VALUES (?, 'heartbeat', ?, unixepoch())`

The payload stored in `task_events` is the union of all provided fields. The WS poller picks up the new event on the next 2s tick and broadcasts a fresh snapshot to connected clients.

**Performance note**

This endpoint does TWO writes (UPDATE + INSERT) per call. It is safe to call up to ~300/sec sustained. If you need higher throughput, batch heartbeats on the worker side (debounce 1-2s).

**Aliases precedence**

If both canonical and alias are provided, the canonical name wins:

- `terminalOutput` > `outputSnippet`
- `errorState` > `error`
- `toolCall` > `tool`
- `progressPct` > `progressPercent`

---

## WebSocket /ws

Unidirectional push from server to client. The server sends JSON frames; clients do not send anything back.

**Connection**

```
ws://localhost:3000/                    # standalone mode
ws://187.77.130.62:3000/                # remote-client mode
```

The server sends a `snapshot` frame immediately on connect, then again on every poll cycle (2s default) where at least one new event or comment was detected.

**Frame format**

```json
{
  "type": "snapshot",
  "data": {
    "dev":   { "...": "see /api/snapshot response shape" },
    "paper": { "...": "same shape" }
  }
}
```

`type` is currently always `"snapshot"`. Future message types (e.g. targeted updates) will use other values.

**No-client optimization**

The poll loop short-circuits when `wss.clients.size === 0`. Connected clients always get a fresh snapshot if any delta was detected. If no deltas, the frame is dropped — clients display the last snapshot they received.

**Disconnect handling**

Server logs `[agent-office] Client disconnected` on close. Clients should implement reconnect-with-backoff (the bundled `public/app.js` does this automatically).

---

## Static assets

- `GET /` → `public/index.html` (with `__BACKEND_WS__` token replaced in remote-client mode)
- `GET /app.js`, `/style.css` → static files from `public/`
- All other paths return 404 (no SPA fallback; the dashboard is a single page)

---

## Rate limits

None enforced. Best-effort behavior under load:

- Heartbeat POSTs >300/sec: SQLite write contention, p99 climbs
- WS clients >50: broadcast loop CPU grows linearly
- /api/snapshot >10/sec from the same client: probably a bug, will eventually OOM the browser

If you need rate limiting, add it as a reverse proxy in front of the Node server (nginx `limit_req` is the simplest path).

---

## OpenAPI spec

A machine-readable spec is in `/root/agent-office/docs/heartbeat-api-v1.1.yaml`. It covers `/api/agents/{profileId}/heartbeat` in full detail. The other endpoints are simpler and documented above.

---

## Versioning

The heartbeat API is at v1.1 (additive changes only; aliases exist for v1.0 fields). Breaking changes will bump the major version and require a migration window.
