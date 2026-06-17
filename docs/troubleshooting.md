# Agent Office — Troubleshooting Guide

Common issues and their diagnostics. For each issue: symptom → root cause → fix.

## Quick triage flow

1. Hit `/api/health`. If 5xx, the server is down — restart.
2. If `/api/health` is OK, hit `/api/snapshot` and check `db.dev` and `db.paper`. If either is `false`, the kanban DB is missing or locked.
3. If both are `true`, check `journalctl -u agent-office -n 50` for errors.
4. If logs are clean, the issue is likely in the browser (cache, WS state, frontend bug).

---

## Issue: Dashboard loads but roster shows `--` instead of badge abbreviation

**Symptom**: Profile cards in the roster show `--` where the badge should be.

**Causes and fixes**:

1. **Frontend `BADGES` map out of sync with backend `ICON_OVERRIDES`**
   - Check: `curl -s http://localhost:3000/api/snapshot | jq '.dev.profiles[] | {id, icon}'`
   - If API returns the correct icon but UI shows `--`, the frontend map is missing the entry.
   - Fix: Add the profile id to `BADGES` in `public/index.html` (line ~827-833).

2. **Auto-derivation producing wrong badge**
   - The default auto-derivation is `id.split('-').map(w => w[0].toUpperCase()).join('').slice(0, 3)`.
   - For long IDs (e.g. `paper-technical`) this works, but for short or unusual IDs the result may be confusing.
   - Fix: Add an explicit `ICON_OVERRIDES` entry in `server/config.js`.

3. **Browser cache serving stale frontend**
   - The frontend is served as a static file. If you updated the `BADGES` map, browsers may still have the old copy.
   - Fix: Hard refresh (Ctrl+Shift+R / Cmd+Shift+R), or open DevTools → Network → Disable cache.

4. **WebSocket state stale**
   - If the profile was added after the browser connected, the WS may not have received the updated snapshot.
   - Fix: Close and reopen the WS connection, or refresh the page.

---

## Issue: Inspector shows current task but empty live data / terminal output / event log

**Symptom**: The inspector panel renders the task title and "running" status, but the live data, terminal output, and event log sections are all empty.

**Causes and fixes**:

1. **Worker not sending heartbeats**
   - Check: `ps aux | grep profile-name` — is the worker process actually running?
   - If no process: the task state is stale. Reset status or restart the dispatcher.
   - If yes: continue to step 2.

2. **Heartbeat bridge cron not running**
   - The bridge (`bridge/heartbeat_bridge.py`) is the safety net. It should run every 15-30s via cron.
   - Check: `crontab -l | grep heartbeat_bridge`
   - Fix: Add the cron entry if missing (see runbook §1).

3. **Heartbeat POSTs are failing**
   - The bridge logs to journald or cron output. Check for 5xx responses or connection errors.
   - Check the agent-office service logs: `journalctl -u agent-office -n 50 | grep heartbeat`
   - Fix: Restart the service if it's stuck.

4. **Worker is a `delegate_task` subagent, not a kanban worker**
   - The kanban heartbeat bridge in `kanban_tools.py` only fires for workers spawned by the dispatcher with `HERMES_PROFILE` set. `delegate_task` subagents do NOT trigger it.
   - Symptom: parent process is alive, but no heartbeat events for the task.
   - Fix: See [agent-office-ops skill — Migrating a team from delegate_task to Kanban workers](../../.hermes/profiles/dev-lead/skills/devops/agent-office-ops/SKILL.md#migrating-a-team-from-delegate_task-to-kanban-workers). Workaround: monitor the parent gateway's logs directly.

5. **Heartbeat writes to DB but WS layer doesn't see the event**
   - Very rare. Check `task_events` directly: `sqlite3 /root/.hermes/kanban.db "SELECT COUNT(*) FROM task_events WHERE kind='heartbeat' AND created_at > unixepoch() - 60"`
   - If >0 but the inspector is empty, the WS layer's `lastIds[teamId].eventId` may be ahead of the actual latest id. Restart the service to reseed.

---

## Issue: Slow /api/snapshot (>100ms)

**Symptom**: Browser feels laggy, panel updates are delayed, /api/snapshot takes seconds.

**Causes and fixes**:

1. **Zombie node process holding port 3000**
   - When systemd restarts the service, the old node process may not die (orphaned by parent, doesn't respond to SIGTERM).
   - Symptom: `ps aux | grep "node.*agent-office"` shows multiple node processes, one of which is at 95%+ CPU.
   - Fix: `kill -9 <old_pid>`, then `systemctl restart agent-office.service`. Verify with `systemctl status agent-office.service` that the PID matches the new node process.

2. **Kanban DB locked by another process**
   - SQLite is single-writer. If the kanban DB is being vacuumed or backed up, reads will block.
   - Check: `lsof /root/.hermes/kanban.db` — any other process holding the file?
   - Fix: Wait for the write to finish, or run the backup via `sqlite3 .backup` (non-blocking).

3. **Large dataset**
   - The snapshot query has hardcoded LIMITs (200/100/50/50). At the current dataset (~50 tasks, 100 events), the snapshot is ~580KB. At 10x that, it may be 5MB+ and slow to serialize.
   - Fix: Add SQLite indexes (see [runbook §4](./runbook.md#4-scale)). If that's not enough, reduce the LIMITs in `server/db.js:buildSnapshot`.

4. **WS client count very high**
   - Each delta broadcast serializes the full snapshot to JSON. With 50+ clients, this can hit the event loop.
   - Fix: Switch to per-team deltas (code in `ws.js` is partially there). Or reduce `POLL_INTERVAL` to throttle the broadcasts.

---

## Issue: Heartbeat POST returns 404

**Symptom**: `curl -X POST /api/agents/api-dev/heartbeat -d '{"taskId":"t_xxx",...}'` returns 404.

**Causes and fixes**:

1. **Task not in any kanban DB**
   - The endpoint scans all configured team DBs for the `taskId`. If not found, 404.
   - Check: `sqlite3 /root/.hermes/kanban.db "SELECT id FROM tasks WHERE id='t_xxx'"`
   - Fix: Verify the task exists. If it does, the DB path in `config.js` is wrong.

2. **Task on the wrong team's board**
   - The task is on a board that's not in `TEAMS`. E.g., a paper-team task with a dev profile.
   - Check: `curl -s http://localhost:3000/api/teams` — is the team listed?
   - Fix: Add the team to `config.js` if it should be there.

---

## Issue: Browser console shows WebSocket connection errors

**Symptom**: `WebSocket connection to 'ws://localhost:3000/' failed` in the browser console.

**Causes and fixes**:

1. **REMOTE_BACKEND misconfigured**
   - In remote-client mode, the server injects the WS URL into `index.html`. If `REMOTE_BACKEND` is wrong, the browser tries to connect to a non-existent server.
   - Check: `cat /root/agent-office/.env | grep REMOTE`
   - Fix: Set `REMOTE_BACKEND=http://187.77.130.62:3000` (or the right URL).

2. **Server not actually running**
   - `systemctl status agent-office` — should be `active`.
   - Fix: `systemctl start agent-office`.

3. **Firewall blocking the port**
   - `ufw status` or `iptables -L` — is port 3000 open?
   - Fix: `ufw allow 3000/tcp` or equivalent.

4. **WS upgrade failing due to reverse proxy**
   - If nginx/cloudflare is in front, they may strip the `Upgrade` header.
   - Fix: Configure the proxy to pass `Connection: upgrade` and `Upgrade: websocket` headers.

---

## Issue: Memory grows steadily (RSS climbing)

**Symptom**: `ps -o rss= -p $(pgrep -f "node.*agent-office")` shows RSS going from 100MB → 200MB → 400MB over hours, with no corresponding workload bump.

**Cause**: Unclosed WS connections, leaked heartbeat payload buffers, or retained snapshot strings in the poller loop.

**Fix**:

1. **Mitigation**: `systemctl restart agent-office` weekly via cron to reset memory. Add `0 4 * * 0 /bin/systemctl restart agent-office` to root's crontab.
2. **Long-term**: Heapdump and investigate (`node --inspect`, take a snapshot, find retained objects). Common culprits: `setInterval` callbacks, large parsed JSON strings held in module scope.

---

## Issue: New profile added but doesn't appear in roster

**Symptom**: You created a new `~/.hermes/profiles/new-profile/` directory with `config.yaml`, but the dashboard roster doesn't show it.

**Fix**:

1. Restart the service — profile discovery runs at startup, not on every snapshot.
2. Verify the config: `cat ~/.hermes/profiles/new-profile/config.yaml` should be valid YAML with a `model:` section.
3. If still missing, check that the profile's `id` doesn't match the auto-derivation exclusion list (none currently exist, but if one is added in `config.js` it would skip the profile).
4. Verify with `curl -s http://localhost:3000/api/snapshot | jq '.dev.profiles[].id'` — should include the new id.

---

## Issue: DB shows `db.dev: false` in /api/health

**Symptom**: `/api/health` returns `{"db":{"dev":false,"paper":true}}`.

**Causes and fixes**:

1. **DB file missing**
   - Check: `ls -la /root/.hermes/kanban.db` (the path from `config.js`)
   - Fix: Restore from backup, or re-initialize the kanban DB.

2. **Permission denied**
   - Check: `sudo -u nodeuser ls -la /root/.hermes/kanban.db` (substitute the actual user the service runs as)
   - Fix: `chmod 644 /root/.hermes/kanban.db` and ensure the parent dir is traversable.

3. **Corrupt DB**
   - Check: `sqlite3 /root/.hermes/kanban.db "PRAGMA integrity_check"` — should return `ok`.
   - Fix: If corrupt, restore from the latest backup.

---

## Issue: Heartbeat 400 with "taskId and command are required"

**Symptom**: Worker is sending heartbeats but getting 400 responses.

**Cause**: The worker is missing one of the two required fields. Likely a bug in the heartbeat code path.

**Fix**:

1. Check the worker's heartbeat code — it should always include `taskId` (from `HERMES_KANBAN_TASK`) and `command` (a non-empty string describing the current action).
2. If using the bridge, check that the DB query returns the expected columns (`id` for taskId, `current_command` for command). The bridge reads `current_command` from the task row, so if the task was never heartbeated before, this will be null and the POST will 400.
3. Bridge is designed to be best-effort — a 400 here just means the bridge will retry on the next tick. Not a critical issue.

---

## Issue: Frontend shows 1000s of cards and is unresponsive

**Symptom**: Kanban board has so many cards that the page hangs.

**Cause**: Tasks pile up in `done` / `archived` status but the LIMIT-200 window is still full of them.

**Fix**:

1. Archive old completed tasks. The `archive_task` tool or direct SQL: `UPDATE tasks SET status='archived' WHERE status='done' AND completed_at < unixepoch() - 2592000` (older than 30 days).
2. Reduce the LIMIT in `server/db.js:buildSnapshot` from 200 to 100 if archiving isn't an option.
3. Add server-side filtering to only return active tasks (status != done/archived).

---

## Diagnostic cheat sheet

```bash
# Is the service up?
systemctl is-active agent-office

# Is the process healthy?
ps -o pid,pcpu,pmem,rss,cmd -p $(pgrep -f "node.*agent-office")

# Are the DBs reachable?
curl -s http://localhost:3000/api/health

# Is the WS port listening?
ss -tlnp | grep :3000

# Recent errors in logs?
journalctl -u agent-office -n 100 --no-pager | grep -i error

# Heartbeat rate (last 60s)?
python3 -c "
import sqlite3
conn = sqlite3.connect('/root/.hermes/kanban.db')
n = conn.execute('SELECT COUNT(*) FROM task_events WHERE kind=\"heartbeat\" AND created_at > unixepoch() - 60').fetchone()[0]
print(f'{n} heartbeats/min')
"

# Are there stale "running" tasks with no heartbeats?
python3 -c "
import sqlite3
conn = sqlite3.connect('/root/.hermes/kanban.db')
rows = conn.execute('''
SELECT id, assignee, last_heartbeat_at,
       (unixepoch() - last_heartbeat_at) as age_sec
FROM tasks WHERE status='running'
ORDER BY last_heartbeat_at ASC
''').fetchall()
for r in rows: print(r)
"

# WebSocket client count (from server logs)
journalctl -u agent-office --since "5m ago" | grep -c "Client connected"
```

If a diagnostic above reveals a state you can't resolve, file an issue with the relevant output attached.
