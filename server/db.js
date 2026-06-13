const Database = require('better-sqlite3');
const fs = require('fs');

class DatabaseManager {
  constructor(config) {
    this.config = config;
    this.dbs = {};
  }

  connect(teamId, dbPath) {
    try {
      if (fs.existsSync(dbPath)) {
        this.dbs[teamId] = new Database(dbPath, { readonly: false, fileMustExist: true });
        console.log(`[agent-office] [${teamId}] Connected to kanban DB: ${dbPath}`);
      } else {
        console.warn(`[agent-office] [${teamId}] Kanban DB not found at ${dbPath}`);
      }
    } catch (e) {
      console.error(`[agent-office] [${teamId}] DB error: ${e.message}`);
    }
  }

  connectAll() {
    for (const [tid, team] of Object.entries(this.config.TEAMS)) {
      this.connect(tid, team.dbPath);
    }
  }

  disconnect(teamId) {
    if (this.dbs[teamId]) {
      try { this.dbs[teamId].close(); } catch (e) { /* ignore close errors */ }
      delete this.dbs[teamId];
    }
  }

  disconnectAll() {
    for (const tid of Object.keys(this.dbs)) {
      this.disconnect(tid);
    }
  }

  query(teamId, sql, params = []) {
    const db = this.dbs[teamId];
    if (!db) return [];
    try {
      return db.prepare(sql).all(...params);
    } catch (e) {
      console.error(`[agent-office] [${teamId}] Query error: ${e.message}`);
      return [];
    }
  }

  run(teamId, sql, params = []) {
    const db = this.dbs[teamId];
    if (!db) return { changes: 0 };
    try {
      return db.prepare(sql).run(...params);
    } catch (e) {
      console.error(`[agent-office] [${teamId}] Run error: ${e.message}`);
      return { changes: 0 };
    }
  }

  buildSnapshot(teamId) {
    const team = this.config.TEAMS[teamId];
    if (!team) return null;
    const db = this.dbs[teamId];
    if (!db) return null;

    const tasks = this.query(teamId, 'SELECT id, title, body, assignee, status, priority, tenant, created_at, started_at, completed_at, result, current_command, current_progress, model_override, workspace_path, last_heartbeat_at FROM tasks ORDER BY created_at DESC LIMIT 200');
    const events = this.query(teamId, 'SELECT id, task_id, kind, payload, created_at FROM task_events ORDER BY id DESC LIMIT 100');
    const comments = this.query(teamId, 'SELECT id, task_id, author, body, created_at FROM task_comments ORDER BY id DESC LIMIT 50');
    const runs = this.query(teamId, 'SELECT id, task_id, profile, status, started_at, ended_at, outcome, summary, metadata FROM task_runs ORDER BY started_at DESC LIMIT 50');
    const links = this.query(teamId, 'SELECT parent_id, child_id FROM task_links');

    // Build a map of taskId -> latest heartbeat payload for active tasks
    const heartbeatByTask = {};
    for (const evt of events) {
      if (evt.kind === 'heartbeat' && evt.payload) {
        try {
          const parsed = JSON.parse(evt.payload);
          heartbeatByTask[evt.task_id] = Object.assign(parsed, heartbeatByTask[evt.task_id] || {});
        } catch (e) { /* malformed payload, skip */ }
      }
    }

    const profiles = team.profiles.map(p => {
      const activeTask = tasks.find(t => t.assignee === p.id && (t.status === 'running' || t.status === 'blocked'));
      const lastRun = runs.find(r => r.profile === p.id);
      const hb = activeTask ? heartbeatByTask[activeTask.id] : null;

      // Merge config.yaml metadata for this profile
      const meta = this.config.getProfileMetadata ? this.config.getProfileMetadata(p.id) : {};

      // Determine effective model: task-level override takes precedence over profile default
      const effectiveModel = activeTask && activeTask.model_override
        ? activeTask.model_override
        : p.model;

      return {
        // Base fields (existing)
        id: p.id,
        name: p.name,
        model: effectiveModel,
        icon: p.icon,
        status: activeTask ? activeTask.status : 'idle',
        currentTask: activeTask ? activeTask.title : null,
        currentTaskId: activeTask ? activeTask.id : null,
        currentCommand: activeTask ? activeTask.current_command : null,
        currentProgress: activeTask ? activeTask.current_progress : null,
        lastActivity: lastRun ? lastRun.ended_at || lastRun.started_at : null,

        // Config-enriched fields (from config.yaml / profile.yaml)
        provider: meta.provider || null,
        activeToolsets: meta.toolsets || [],
        disabledToolsets: meta.disabledToolsets || [],
        maxTurns: meta.maxTurns || null,
        goalMode: meta.goalMode || false,
        personality: meta.personality || null,
        terminalBackend: meta.terminalBackend || null,
        description: meta.description || null,
        memoryEnabled: meta.memoryEnabled !== undefined ? meta.memoryEnabled : null,
        maxConcurrentChildren: meta.maxConcurrentChildren || null,
        maxSpawnDepth: meta.maxSpawnDepth || null,
        reasoningEffort: meta.reasoningEffort || null,

        // Active task workspace path
        workspacePath: activeTask ? activeTask.workspace_path : null,

        // Heartbeat-derived fields (from latest heartbeat payload)
        progressPct: hb && hb.progressPct !== undefined ? hb.progressPct : null,
        currentSkill: hb ? (hb.skill || null) : null,
        currentTool: hb ? (hb.toolCall || null) : null,
        actionType: hb ? (hb.actionType || null) : null,
        terminalOutput: hb ? (hb.terminalOutput || null) : null,
        fileEdited: hb ? (hb.fileEdited || null) : null,
        contextPct: hb && hb.contextPct !== undefined ? hb.contextPct : null,
        turnCount: hb && hb.turnCount !== undefined ? hb.turnCount : null,
        sessionMaxTurns: hb && hb.maxTurns !== undefined ? hb.maxTurns : null,
        errorState: hb ? (hb.errorState || null) : null,
        sessionDuration: hb && hb.sessionDuration !== undefined ? hb.sessionDuration : null,
        subagentActive: hb && hb.subagentActive !== undefined ? hb.subagentActive : null,
        memoryUpdated: hb && hb.memoryUpdated !== undefined ? hb.memoryUpdated : null,
        lastHeartbeatAt: activeTask ? activeTask.last_heartbeat_at : null,
      };
    });

    const byStatus = {};
    tasks.forEach(t => { byStatus[t.status] = (byStatus[t.status] || 0) + 1; });
    const byProfile = {};
    tasks.filter(t => t.status !== 'done').forEach(t => {
      if (t.assignee) {
        byProfile[t.assignee] = byProfile[t.assignee] || { running: 0, blocked: 0, todo: 0 };
        if (byProfile[t.assignee][t.status] !== undefined) byProfile[t.assignee][t.status]++;
      }
    });

    return {
      profiles, tasks, events, comments, runs, links,
      standup: {
        totalTasks: tasks.length,
        byStatus, byProfile,
        blockers: tasks.filter(t => t.status === 'blocked'),
      },
      serverTime: Date.now(),
    };
  }

  buildAllSnapshots() {
    const allData = {};
    for (const tid of Object.keys(this.config.TEAMS)) {
      allData[tid] = this.buildSnapshot(tid);
    }
    return allData;
  }

  getMaxIds(teamId) {
    const db = this.dbs[teamId];
    if (!db) return { eventId: 0, commentId: 0 };
    try {
      const maxEvent = db.prepare('SELECT MAX(id) as maxId FROM task_events').get();
      const maxComment = db.prepare('SELECT MAX(id) as maxId FROM task_comments').get();
      return { eventId: maxEvent.maxId || 0, commentId: maxComment.maxId || 0 };
    } catch (e) {
      console.error(`[agent-office] [${teamId}] getMaxIds error: ${e.message}`);
      return { eventId: 0, commentId: 0 };
    }
  }

  getDbStatus() {
    const status = {};
    for (const tid of Object.keys(this.config.TEAMS)) {
      status[tid] = !!this.dbs[tid];
    }
    return status;
  }
}

module.exports = DatabaseManager;
