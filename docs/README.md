# Agent Office Documentation

Operational documentation for the Agent Office real-time dashboard for the Hermes AI dev team. The dashboard runs at http://187.77.130.62:3000 in production.

## Contents

| Document | Purpose |
|---|---|
| [architecture.md](./architecture.md) | System topology, deployment modes, data flow diagrams, file layout |
| [runbook.md](./runbook.md) | Deploy, monitor, troubleshoot, scale — the day-to-day operations guide |
| [endpoints.md](./endpoints.md) | All HTTP/WS endpoints with full request/response contracts |
| [benchmarks.md](./benchmarks.md) | Performance targets, measured numbers, scaling thresholds |
| [troubleshooting.md](./troubleshooting.md) | Common issues, diagnostics, fixes, diagnostic cheat sheet |
| [heartbeat-api-v1.1.yaml](./heartbeat-api-v1.1.yaml) | OpenAPI 3.1 spec for the heartbeat API (machine-readable) |

## What is Agent Office?

A live virtual office for the Hermes AI dev team. Shows:

- Team roster of 13 dev profiles + 5 paper profiles with live status
- Kanban board grouped by status, color-coded by assignee
- Real-time activity feed (task events stream)
- Agent Inspector panel with live data, terminal output, event log, run history
- Standup summary (sprint health at a glance)
- Agent chat (kanban task comments as chat bubbles)

## How it works (TL;DR)

A Node.js + Express + WebSocket server reads two SQLite kanban DBs (dev + paper) and pushes a snapshot to connected browsers every 2 seconds. Workers POST heartbeats to enrich the snapshot with live data (progress, current skill, terminal output, etc.). A Python cron-fed bridge acts as a safety net for workers that skip the event log.

For the full architecture, read [architecture.md](./architecture.md). For the day-to-day operations, read [runbook.md](./runbook.md).

## Source code

- Server: `/root/agent-office/server/`
- Frontend: `/root/agent-office/public/`
- Heartbeat bridge: `/root/agent-office/bridge/`

## Related skills

- `agent-office-ops` — operational knowledge for the dashboard, including the v1.1 inspector fields reference. Located at `~/.hermes/profiles/dev-lead/skills/devops/agent-office-ops/`.

## Document conventions

- All timestamps are unixepoch (seconds) unless otherwise noted
- All paths are absolute and start with `/root/`
- All commands assume root on the VPS (187.77.130.62)
- "Worker" = a Hermes agent spawned by the kanban dispatcher
- "Bridge" = `bridge/heartbeat_bridge.py`, the cron-fed heartbeat safety net
