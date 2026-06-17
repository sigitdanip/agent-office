const { WebSocketServer } = require('ws');
const { log } = require('./logger');
const { metrics } = require('./metrics');

class WebSocketManager {
  constructor(server, db, config) {
    this.db = db;
    this.config = config;
    this.wss = new WebSocketServer({ server });
    this.lastIds = {};
    this.pollTimer = null;
    this._snapshotCache = null;     // cached full snapshot
    this._snapshotCacheTime = 0;    // timestamp of last snapshot build
    this._snapshotCacheTTL = 500;   // reuse cached snapshot for 500ms (debounce rapid polls)
    this._lastBroadcastTime = 0;    // throttle broadcasts to 1 per second

    // Seed last IDs using SELECT MAX(id) — lighter than loading full snapshot
    for (const tid of Object.keys(config.TEAMS)) {
      const ids = db.getMaxIds(tid);
      this.lastIds[tid] = { eventId: ids.eventId, commentId: ids.commentId };
    }

    this._setupConnectionHandler();
  }

  _setupConnectionHandler() {
    this.wss.on('connection', (ws) => {
      log.info('Client connected', { clientCount: this.wss.clients.size });
      metrics.get('websocket_clients').set({}, this.wss.clients.size);
      metrics.get('websocket_connections_total').inc();

      ws.on('error', (err) => {
        log.error('WebSocket error', { error: err.message });
      });

      try {
        const snap = this.db.buildAllSnapshots();
        this._snapshotCache = snap;
        this._snapshotCacheTime = Date.now();
        ws.send(JSON.stringify({ type: 'snapshot', data: snap }));
      } catch (e) {
        log.error('Failed to send snapshot', { error: e.message });
      }

      ws.on('close', () => {
        log.info('Client disconnected', { clientCount: this.wss.clients.size });
        metrics.get('websocket_clients').set({}, this.wss.clients.size);
        metrics.get('websocket_disconnections_total').inc();
      });
    });
  }

  start() {
    this.pollTimer = setInterval(() => this._poll(), this.config.POLL_INTERVAL);
    log.info('Polling started', { interval_ms: this.config.POLL_INTERVAL });
  }

  stop() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.wss.close();
    log.info('WebSocket server stopped');
  }

  _poll() {
    // Skip poll cycle if no clients connected — performance fix
    if (this.wss.clients.size === 0) return;
    try {
      let anyDelta = false;
      for (const tid of Object.keys(this.config.TEAMS)) {
        const hasDelta = this._getDeltaForTeam(tid);
        if (hasDelta) anyDelta = true;
      }
      if (anyDelta) {
        // Throttle: max 1 broadcast per second to avoid flooding on rapid heartbeats
        const now = Date.now();
        if (now - this._lastBroadcastTime < 1000) return;
        this._lastBroadcastTime = now;

        // Use cached snapshot if fresh (< TTL), otherwise rebuild
        let snap;
        if (this._snapshotCache && (now - this._snapshotCacheTime) < this._snapshotCacheTTL) {
          snap = this._snapshotCache;
        } else {
          snap = this.db.buildAllSnapshots();
          this._snapshotCache = snap;
          this._snapshotCacheTime = now;
        }
        this._broadcast({ type: 'delta', data: snap });
      }
    } catch (e) {
      log.error('Poll cycle error', { error: e.message });
    }
  }

  _getDeltaForTeam(teamId) {
    const ids = this.lastIds[teamId];
    if (!ids) return false;
    const evts = this.db.query(teamId, 'SELECT id, task_id, kind, payload, created_at FROM task_events WHERE id > ? ORDER BY id ASC LIMIT 500', [ids.eventId]);
    const cmts = this.db.query(teamId, 'SELECT id, task_id, author, body, created_at FROM task_comments WHERE id > ? ORDER BY id ASC LIMIT 200', [ids.commentId]);
    if (evts.length > 0) ids.eventId = evts[evts.length - 1].id;
    if (cmts.length > 0) ids.commentId = cmts[cmts.length - 1].id;
    return evts.length > 0 || cmts.length > 0;
  }

  _broadcast(msg) {
    if (this.wss.clients.size === 0) return;
    const payload = JSON.stringify(msg);
    this.wss.clients.forEach(c => {
      if (c.readyState === 1) {
        try {
          c.send(payload);
        } catch (e) {
          log.error('Broadcast send error', { error: e.message });
        }
      }
    });
  }
}

module.exports = WebSocketManager;
