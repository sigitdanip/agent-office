# Agent Office — Operational Runbook

This runbook covers the day-to-day operations for the Agent Office dashboard running on the VPS at 187.77.130.62:3000. It assumes the systemd-managed deployment described in `/root/agent-office/docs/architecture.md`.

For architectural context, see [architecture.md](./architecture.md). For endpoint contracts, see [endpoints.md](./endpoints.md). For performance targets, see [benchmarks.md](./benchmarks.md). For issue diagnostics, see [troubleshooting.md](./troubleshooting.md).

## 1. Deploy

### Fresh install on a new VPS

```
# 1. Clone the repo
git clone https://github.com/sigitdanip/agent-office.git /root/agent-office
cd /root/agent-office

# 2. Install deps (native better-sqlite3 needs python3 + build tools)
npm install

# 3. Create .env
cat > .env <<EOF
PORT=3000
DEV_KANBAN_DB=/root/.hermes/kanban.db
PAPER_KANBAN_DB=/root/.hermes/kanban/boards/paper-lead/kanban.db
POLL_INTERVAL=2000
EOF

# 4. Install systemd unit
cp deploy/agent-office.service /etc/systemd/system/  # or use the one already in the repo
systemctl daemon-reload
systemctl enable --now agent-office.service

# 5. Verify
systemctl status agent-office --no-pager
curl -s http://localhost:3000/api/health
```

### Update an existing deploy

```
cd /root/agent-office
git pull
npm install                       # only if package.json changed
systemctl restart agent-office    # picks up server-side changes
# Frontend-only changes (public/) don't need a restart — browser refreshes pick them up.
```

### Rollback

```
cd /root/agent-office
git log --oneline -5
git checkout <previous-commit>
systemctl restart agent-office
```

The `server/index-fixed.js` file is the legacy fallback kept specifically for emergency rollback — swap the `require('./index')` in `package.json`'s main to `./server/index-fixed` and restart.

### Adding a new profile to the roster

Three places need updates (see [agent-office-ops skill](../../.hermes/profiles/dev-lead/skills/devops/agent-office-ops/SKILL.md#profile-roster-sync)):

1. `server/config.js` `ICON_OVERRIDES` (if auto-derivation produces a wrong badge)
2. `server/config.js` `NAME_OVERRIDES` (if the human-readable name needs polish)
3. `public/index.html` `BADGES` object (line ~827-833)

Verify with `curl -s http://localhost:3000/api/snapshot | jq '.dev.profiles[] | select(.id == "new-profile")'` — should show the badge in `.icon`, not `null`.

### Adding a new team (e.g. research team)

1. Create the team's kanban DB at `/root/.hermes/kanban/boards/research/kanban.db`
2. Add a `TEAMS.research` entry in `server/config.js` with the DB path
3. Restart the server
4. Add a new "Research Office" group in `public/index.html` if you want a separate column in the roster UI

## 2. Monitor

### Liveness checks

| Signal | Command | Healthy value |
|---|---|---|
| Service running | `systemctl is-active agent-office` | `active` |
| Health endpoint | `curl -s http://localhost:3000/api/health` | `{"ok":true, "db":{"dev":true,"paper":true}}` |
| Snapshot latency | `time curl -s -o /dev/null http://localhost:3000/api/snapshot` | <50ms cold, <10ms cached |
| Process memory | `ps -o rss= -p $(pgrep -f "node.*agent-office")` | <200MB idle, <400MB under load |
| CPU | `top -b -n1 -p $(pgrep -f "node.*agent-office")` | <5% idle, <20% under load |
| DB connectivity | `curl -s http://localhost:3000/api/health \| jq '.db'` | both teams `true` |

### Logs

```
journalctl -u agent-office -f           # follow logs
journalctl -u agent-office -n 200       # last 200 lines
journalctl -u agent-office --since "1h ago"
grep -i error /var/log/agent-office.log # historical errors (file-logged too)
```

The service writes both to journald AND to `/var/log/agent-office.log` (configured in the systemd unit's `StandardOutput=append:` directive).

### Heartbeat liveness (worker side)

Check that workers are sending heartbeats:

```python
python3 -c "
import sqlite3
conn = sqlite3.connect('/root/.hermes/kanban.db')
cur = conn.execute('SELECT COUNT(*) FROM task_events WHERE kind=\"heartbeat\" AND created_at > unixepoch() - 60')
print(f'Heartbeats in last 60s: {cur.fetchone()[0]}')
"
```

Expected: >0 for every active worker, refreshing every 15-30s. Zero heartbeats for a "running" task means the worker is stuck or the bridge cron is down.

### WebSocket connection count

The server logs `[agent-office] Client connected` / `Client disconnected` on each WS handshake. To check current count from the outside, hit the snapshot endpoint and time it — connected clients skip the empty-poll optimization in `ws.js`.

## 3. Troubleshoot

See [troubleshooting.md](./troubleshooting.md) for the full diagnostic cookbook. Quick triage:

1. **Dashboard blank** → `/api/health` first. If 5xx, restart. If OK, check browser console.
2. **Roster shows `--` badges** → hard refresh browser. If still bad, check the `BADGES` map in `index.html`.
3. **Inspector empty live data** → check heartbeat count for the task. If 0 and process is alive, bridge is broken.
4. **Slow /api/snapshot** → check `ps aux | grep "node.*agent-office"` for zombie processes. Kill extras.
5. **Disk full** → `/var/log/agent-office.log` rotates via `logrotate` (add a config if not present).

## 4. Scale

### Vertical scale (single VPS)

The current deployment runs comfortably with:

- Up to 50 tasks in the most recent 200-task window
- Up to 100 events / 50 comments / 50 runs in the snapshot
- 1-5 connected browsers

Limits to watch for (see [benchmarks.md](./benchmarks.md)):

- Snapshot size >2MB: consider raising the task/event LIMITs in `db.js`
- WS broadcast CPU >10%: switch to per-team deltas (already in `ws.js`)
- DB read latency >50ms: add SQLite indexes (see below)

### Adding SQLite indexes

For large boards, add these to speed up the snapshot builder:

```sql
CREATE INDEX IF NOT EXISTS idx_tasks_status_assignee ON tasks(status, assignee);
CREATE INDEX IF NOT EXISTS idx_task_events_task_id_kind ON task_events(task_id, kind);
CREATE INDEX IF NOT EXISTS idx_task_events_id ON task_events(id);
CREATE INDEX IF NOT EXISTS idx_task_runs_profile ON task_runs(profile);
CREATE INDEX IF NOT EXISTS idx_task_comments_task_id ON task_comments(task_id);
```

Run via `sqlite3 /root/.hermes/kanban.db < indexes.sql` during a maintenance window (write lock during index build on a hot DB is fast on SQLite since it's append-only).

### Horizontal scale (multiple VPS instances)

Not currently supported. The single-server model relies on:
- One process reading the kanban DB (SQLite write contention)
- One process broadcasting to all WS clients

To scale horizontally, you would need to:
1. Replace SQLite with a Postgres backend (the kanban schema is portable)
2. Move the WS layer to a pub/sub (Redis, NATS)
3. Run N stateless server replicas behind a load balancer with sticky WS sessions

This is a major refactor — defer until the single-VPS limits are hit.

### Memory leak check

Node.js won't garbage collect WS connections that aren't explicitly closed. Verify with:

```
ps -o rss= -p $(pgrep -f "node.*agent-office")
```

If RSS grows steadily over hours without a corresponding workload bump, there's a leak. Mitigate with `systemctl restart agent-office` weekly via cron, then file an issue.

## 5. Backup and restore

### Kanban DB backup

The kanban DB is the source of truth — Agent Office is read-only against it (except heartbeat writes). Back it up:

```
# Hourly snapshot via cron (24h retention)
0 * * * * cp /root/.hermes/kanban.db /root/.hermes/backups/kanban-$(date +\%Y\%m\%d-\%H).db
```

Agent Office tolerates the DB being briefly missing at startup (logs a warning, returns null snapshot for that team). Hot backups via `sqlite3 .backup` are safe.

### Disaster recovery

If `/root/agent-office/` itself is lost:

```
git clone https://github.com/sigitdanip/agent-office.git /root/agent-office
cd /root/agent-office
npm install
# recreate .env (see Fresh Install above)
systemctl restart agent-office
```

The dashboard will re-read the kanban DB and rebuild state. Any in-flight WS clients will reconnect automatically.

## 6. Maintenance windows

Agent Office has zero hard dependencies at runtime (it reads from the kanban DB, doesn't require external APIs). Planned maintenance:

1. Restart the service: `systemctl restart agent-office` — 1s downtime, browser auto-reconnects
2. Update server code: pull + restart, no DB migration needed
3. Update config: edit `config.js` and restart

Avoid:
- Editing the kanban DB schema while the dashboard is running (the snapshot query will fail)
- Running `VACUUM` on a hot kanban DB during peak work hours
- Killing the node process without a graceful SIGTERM (use `systemctl restart` which sends SIGTERM)
