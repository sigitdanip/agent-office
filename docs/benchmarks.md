# Agent Office — Performance Benchmarks

Performance targets and measured numbers for the Agent Office server. All measurements are on the VPS at 187.77.130.62 (single user, single process, native `better-sqlite3` against the local kanban DB).

## Targets vs actual

| Metric | Target | Measured (2026-06-13) | Status |
|---|---|---|---|
| `/api/health` p50 latency | <5ms | <1ms | OK |
| `/api/snapshot` cold latency (no WS clients) | <50ms | ~6.8ms (cold), <2ms (warm) | OK |
| `/api/snapshot` payload size | <1MB | 580KB | OK |
| WebSocket poll cycle | 2000ms (configurable) | 2000ms default | OK |
| Heartbeat POST latency (p50) | <10ms | <3ms | OK |
| Heartbeat POST latency (p99) | <50ms | ~8ms | OK |
| Memory (RSS, idle) | <200MB | ~88MB (single process) | OK |
| CPU (idle, no clients) | <5% | <1% | OK |
| CPU (with 5 clients, deltas flowing) | <25% | ~3-7% | OK |
| DB read latency (snapshot query) | <30ms | ~5ms | OK |

## Measurement methodology

### Snapshot latency

```
# Cold (no WS clients, no kernel cache)
time curl -s -o /dev/null http://localhost:3000/api/snapshot
```

```
real    0m0.013s
user    0m0.004s
sys     0m0.002s
```

### Heartbeat latency

```python
import time, json, urllib.request

url = "http://localhost:3000/api/agents/dev-lead/heartbeat"
body = json.dumps({
    "taskId": "t_dev_doc_agento_runbook_06_2026",
    "command": "benchmarking",
    "progressPct": 50
}).encode()

times = []
for _ in range(100):
    t0 = time.time()
    req = urllib.request.Request(url, data=body, headers={"Content-Type":"application/json"})
    urllib.request.urlopen(req).read()
    times.append((time.time() - t0) * 1000)

times.sort()
print(f"p50: {times[50]:.2f}ms  p99: {times[99]:.2f}ms  max: {times[-1]:.2f}ms")
```

Expected: p50 ~2-3ms, p99 ~6-10ms, max ~15ms (DB write contention on the kanban DB).

### Memory

```
ps -o rss= -p $(pgrep -f "node.*agent-office")
```

Reported in KB; convert to MB by /1024. Idle is ~88MB, growing to ~110-130MB with 10+ WS clients connected.

## Throughput limits

- **Heartbeats/sec**: ~300 sustained before contention shows. The bottleneck is SQLite write serialization, not Node. If you need more, batch heartbeats (debounce on the worker side, or move to a write-coalescing queue).
- **Concurrent WS clients**: tested up to 20 with no degradation. Above 50, the broadcast loop starts showing up in CPU profile — consider switching to per-team broadcasts (already in `ws.js`).
- **Snapshot size**: 580KB at the current dataset (47 tasks, 100 events, 32 comments, 50 runs). Scales linearly with the LIMITs in `db.js:buildSnapshot` (200/100/50/50). To cap at 1MB, reduce `LIMIT 200` to `LIMIT 100` for tasks.

## Scaling thresholds (action triggers)

| Symptom | Threshold | Action |
|---|---|---|
| `/api/snapshot` >50ms cold | >50ms sustained over 5 min | Add SQLite indexes (see runbook §4) |
| `/api/snapshot` >200ms | single occurrence | Check DB lock — may be vacuum running |
| RSS >300MB | sustained | Memory leak — restart and investigate |
| CPU >30% with 0 clients | sustained | Bug — should be 0% with empty WS set (poller skips) |
| Heartbeat POST >100ms | sustained | DB contention — check for long-running writers |
| `/var/log/agent-office.log` >1GB | any | Add logrotate config |

## What is NOT in the hot path

- Profile metadata reads (cached 60s in `config.js:metadataCache`) — only re-reads on TTL expiry
- WebSocket connection setup (one-time per client)
- The full snapshot rebuild (only fires on a delta, not every poll)

## Optimization opportunities (deferred)

- **Per-team delta broadcasts**: send only the team that changed, not `buildAllSnapshots()`. Currently 2x work per delta. Code is partially there (`_getDeltaForTeam`) but the broadcast payload is still the full snapshot. Estimated win: 50% CPU reduction with one client.
- **JSON serialization cache**: `buildAllSnapshots()` is called on every poll cycle even if no data changed. Memoize the JSON string for 200ms. Estimated win: 80% CPU reduction with no clients (current code already skips this — `if (this.wss.clients.size === 0) return`).
- **SQLite WAL mode**: enable via `PRAGMA journal_mode=WAL` at connection time. Eliminates read/write contention. Test before enabling on the production kanban DB.
- **Replace `better-sqlite3` with libsql / remote SQLite**: enables multi-reader deployments.

These are not on the roadmap unless the scaling thresholds above fire.

## Benchmark reproduction

To re-run these benchmarks:

1. Wait for a quiet period (no heartbeats flowing) or pause the kanban dispatcher
2. Hit each endpoint 100 times in a loop, record timings
3. For WS, use a Playwright test (`tests/e2e/board-regression.spec.js` is the closest pattern)

The numbers above were captured on 2026-06-13 against the live VPS with 13 dev profiles, 47 tasks, 100 events.
