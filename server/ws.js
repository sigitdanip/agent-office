const { WebSocketServer } = require('ws');

class WebSocketManager {
  constructor(server, db, config) {
    this.db = db;
    this.config = config;
    this.wss = new WebSocketServer({ server });
    this.lastIds = {};
    this.pollTimer = null;

    // Seed last IDs using SELECT MAX(id) — lighter than loading full snapshot
    for (const tid of Object.keys(config.TEAMS)) {
      const ids = db.getMaxIds(tid);
      this.lastIds[tid] = { eventId: ids.eventId, commentId: ids.commentId };
    }

    this._setupConnectionHandler();
  }

  _setupConnectionHandler() {
    this.wss.on('connection', (ws) => {
      console.log('[agent-office] Client connected');
      ws.on('error', (err) => {
        console.error(`[agent-office] WebSocket error: ${err.message}`);
      });
      try {
        ws.send(JSON.stringify({ type: 'snapshot', data: this.db.buildAllSnapshots() }));
      } catch (e) {
        console.error(`[agent-office] Failed to send snapshot: ${e.message}`);
      }
      ws.on('close', () => console.log('[agent-office] Client disconnected'));
    });
  }

  start() {
    this.pollTimer = setInterval(() => this._poll(), this.config.POLL_INTERVAL);
  }

  stop() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.wss.close();
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
        this._broadcast({ type: 'snapshot', data: this.db.buildAllSnapshots() });
      }
    } catch (e) {
      console.error(`[agent-office] Poll cycle error: ${e.message}`);
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
          console.error(`[agent-office] Broadcast send error: ${e.message}`);
        }
      }
    });
  }
}

module.exports = WebSocketManager;
