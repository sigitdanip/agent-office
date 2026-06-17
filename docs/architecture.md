# Agent Office — Architecture

Agent Office is a real-time virtual office dashboard for the Hermes AI dev team. It reads kanban state from two SQLite databases (Dev board, Paper board), enriches it with profile metadata from `config.yaml`, and pushes a live snapshot to connected browsers over WebSocket.

This document describes the runtime topology, the data flow for heartbeats, and the deployment modes.

## Deployment modes

Agent Office has two modes. The same binary runs in both, switching on the presence of `REMOTE_BACKEND`.

| Mode | Use case | Reads kanban from | WS backend |
|---|---|---|---|
| **VPS / standalone** | Production dashboard on 187.77.130.62:3000 | Direct SQLite reads via `better-sqlite3` (native) | The server itself |
| **Local client** | Clone + run on a developer's laptop | No DB (frontend proxy) | The `REMOTE_BACKEND` URL injected into `index.html` |

The local-client mode exists so Windows users can run the UI without native compilation — they only need a static file server, the dashboard connects to the VPS over the public URL.

## Components

```
                       ┌─────────────────────────────────────────────┐
                       │  Browser (index.html + app.js)              │
                       │  - WebSocket client                         │
                       │  - Inspector panel, kanban board, roster    │
                       └────────────────────┬────────────────────────┘
                                            │  ws://.../ws
                                            │  (snapshot frames, every ~2s)
                                            ▼
┌────────────────────────────────────────────────────────────────────┐
│  Agent Office server (Node.js + Express + ws)                      │
│  ┌─────────────────────┐  ┌─────────────────────┐                  │
│  │  HTTP routes        │  │  WebSocketManager   │                  │
│  │  - /api/snapshot    │  │  - poll loop        │                  │
│  │  - /api/teams       │  │  - delta broadcast  │                  │
│  │  - /api/health      │  │  - per-team lastIds │                  │
│  │  - POST heartbeat   │  └──────────┬──────────┘                  │
│  └──────────┬──────────┘             │                              │
│             │                        │                              │
│             ▼                        ▼                              │
│  ┌─────────────────────────────────────────────────┐              │
│  │  DatabaseManager                                │              │
│  │  - connect(teamId, dbPath)                       │              │
│  │  - query / run                                   │              │
│  │  - buildSnapshot(teamId)                         │              │
│  │  - buildAllSnapshots()                           │              │
│  │  - profile metadata cache (60s TTL)              │              │
│  └────────────────────┬────────────────────────────┘              │
│                       │                                            │
│            ┌──────────┴──────────┐                                 │
│            ▼                     ▼                                 │
│  ┌─────────────────┐   ┌─────────────────────┐                   │
│  │  Dev kanban DB  │   │  Paper kanban DB    │                   │
│  │  kanban.db      │   │  boards/paper-lead/ │                   │
│  │  (12 profiles)  │   │  kanban.db (5 prof) │                   │
│  └────────┬────────┘   └────────┬────────────┘                   │
│           │                     │                                  │
└───────────┼─────────────────────┼──────────────────────────────────┘
            │                     │
            │ INSERT heartbeat    │
            │ UPDATE task.*       │
            ▲                     ▲
            │                     │
┌───────────┴─────────────────────┴──────────────────────────────────┐
│  Hermes kanban workers (api-dev, qa-engineer, paper-researcher…) │
│  - spawned by dispatcher with HERMES_PROFILE env var              │
│  - POST to /api/agents/{profileId}/heartbeat during work          │
└────────────────────────────────────────────────────────────────────┘
            │
            │ fallback path (cron, 15-30s)
            ▼
┌────────────────────────────────────────────────────────────────────┐
│  bridge/heartbeat_bridge.py                                         │
│  - reads tasks WHERE status='running' AND last_heartbeat_at<60s    │
│  - re-POSTs last known payload to /api/agents/{profileId}/heartbeat│
│  - safety net for workers that update tasks but skip event log     │
└────────────────────────────────────────────────────────────────────┘
```

## Data flow — heartbeat round-trip

1. Worker (`hermes kanban dispatch --profile api-dev`) starts with `HERMES_PROFILE=api-dev` and `HERMES_AGENT_OFFICE_URL=http://localhost:3000`.
2. Worker calls `kanban_heartbeat(note="reading routes.js")` — internally POSTs to `/api/agents/api-dev/heartbeat` with a payload that includes `taskId`, `command`, `progressPct`, `skill`, `toolCall`, etc.
3. Server (`routes.js`) finds the team whose kanban DB contains the `taskId` (scans dev + paper DBs).
4. Server does two writes atomically: `UPDATE tasks SET current_command, current_progress, last_heartbeat_at` and `INSERT INTO task_events (kind='heartbeat', payload=...)`.
5. WebSocket poller (every 2s) detects new event via `id > lastIds[teamId].eventId`, builds a fresh snapshot, and broadcasts JSON to all connected clients.
6. Browser updates inspector panel in place — no full reload, no flicker.

If step 4 succeeds but step 5-6 are slow or fail (no clients, WS closed), nothing is lost: the heartbeat is durably stored and the next poll cycle / next client will see it.

## Data flow — first connection

1. Browser opens `http://localhost:3000/` (or via remote-client mode, hits the VPS).
2. Server returns `index.html` with `__BACKEND_WS__` replaced by the actual WS URL.
3. Browser opens WS connection, server sends `{ type: 'snapshot', data: buildAllSnapshots() }` immediately.
4. Frontend hydrates roster, kanban columns, standup summary, activity feed.
5. Subsequent deltas arrive every 2s if any new event or comment id was seen.

## Kanban DB schema (high level)

Full reference: `agent-office-ops/references/kanban-db-schema.md`.

Tables Agent Office reads:

- `tasks` — 200 most recent, ordered by `created_at DESC`; joined with `task_runs` and `task_events` for activity view
- `task_events` — 100 most recent; the `kind='heartbeat'` rows are the live-data source
- `task_comments` — 50 most recent; rendered as chat bubbles in agent chat
- `task_runs` — 50 most recent; powers run history panel and last-activity timestamps
- `task_links` — parent→child dependencies, used for nested card rendering

The server does NOT write to any kanban table except `tasks` (the heartbeat updates) and `task_events` (the heartbeat insert). Comments, runs, status changes are still owned by the kanban dispatcher.

## Profile metadata enrichment

The `dev.profiles[]` array in `/api/snapshot` is enriched by reading each profile's `~/.hermes/profiles/{id}/config.yaml` and `profile.yaml` at snapshot build time. The result is cached for 60s (TTL controlled by `METADATA_CACHE_TTL`).

Fields pulled from `config.yaml`:
- `model.default` → falls back to `provider` if missing
- `model.provider`, `model.base_url`
- `agent.max_turns`, `agent.disabled_toolsets`, `agent.reasoning_effort`
- `goals.max_turns > 0` → `goalMode: true`
- `toolsets` → `activeToolsets`
- `terminal.backend` → `terminalBackend`
- `display.personality` → `personality`
- `memory.memory_enabled` → `memoryEnabled`
- `delegation.max_concurrent_children`, `delegation.max_spawn_depth`

From `profile.yaml`:
- `description` → `description`

If `config.yaml` is malformed, the profile still renders — missing fields become `null`. Parse errors are logged at `[agent-office] Failed to parse config for {id}: {message}` and the server keeps going.

## Why two kanban DBs (dev + paper)

Cross-team board isolation is a security feature, not a bug. The dispatcher refuses to let a dev-team profile create a task on a paper-team board, and vice versa. Agent Office respects the same isolation by reading each board's DB directly via the SQLite path — there is no shared bus.

To add a third team: add a `TEAMS.third` entry in `config.js`, point its `dbPath` to a real kanban DB, and add a new "Office" group in the frontend. Profile discovery is automatic (it scans `~/.hermes/profiles/` and buckets by `id.startsWith('paper-')`).

## Failure modes and graceful degradation

- **Kanban DB missing** → team is logged as "DB not found" at startup; snapshot for that team returns `null`; other teams unaffected.
- **Profile config unreadable** → profile renders with `null` metadata; no crash.
- **WebSocket disconnects** → browser auto-reconnects (handled in `app.js`); server tolerates abrupt close.
- **Agent office down** → heartbeats from workers fail silently (best-effort); workers continue, but live data won't update. Cron bridge also fails silently. Workers re-retry on next call.
- **No clients connected** → poller skips the entire cycle (perf optimization in `ws.js`).

## File layout

```
/root/agent-office/
├── server/
│   ├── index.js          # entrypoint, mode switch, server bootstrap
│   ├── config.js         # profile discovery, TEAM/ICON maps, metadata cache
│   ├── db.js             # DatabaseManager — connect, query, snapshot build
│   ├── routes.js         # /api/snapshot, /api/teams, /api/health, /api/agents/.../heartbeat
│   ├── ws.js             # WebSocketManager — poll loop, delta broadcast
│   └── index-fixed.js    # legacy fallback (kept for rollback only)
├── public/
│   ├── index.html        # dashboard SPA, __BACKEND_WS__ token
│   ├── app.js            # WS client, renderers, event handlers
│   └── style.css         # full styling incl. inspector panel
├── bridge/
│   └── heartbeat_bridge.py  # cron-fed safety net for heartbeat events
├── tests/
│   └── e2e/              # Playwright specs
├── docs/
│   ├── architecture.md   # this file
│   ├── runbook.md        # deploy/monitor/troubleshoot/scale
│   ├── benchmarks.md     # performance targets + measured numbers
│   ├── endpoints.md      # HTTP/WS contract reference
│   ├── troubleshooting.md
│   ├── README.md         # docs index
│   └── heartbeat-api-v1.1.yaml  # OpenAPI spec for the heartbeat API
└── package.json
```
