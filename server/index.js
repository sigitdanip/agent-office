#!/usr/bin/env node
// Agent Office server - MULTI-TEAM VERSION
// VPS mode: reads kanban DBs directly, serves REST + WebSocket
// Remote mode: serves static files, frontend connects to VPS backend

const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');

// ==============================
// TOP-LEVEL CRASH CATCHERS — prevents process exit on uncaught errors
// ==============================
process.on('uncaughtException', (err) => {
  console.error(`[agent-office] UNCAUGHT EXCEPTION:`, err);
  // Don't exit — let the server try to recover
});
process.on('unhandledRejection', (reason) => {
  console.error(`[agent-office] UNHANDLED REJECTION:`, reason);
});

// Load .env if present
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n').filter(Boolean);
  for (const line of lines) {
    const eq = line.indexOf('=');
    if (eq > 0) {
      const k = line.slice(0, eq).trim();
      const v = line.slice(eq + 1).trim();
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

const PORT = process.env.PORT || 3000;
const REMOTE_BACKEND = process.env.REMOTE_BACKEND || null;

// Dev profiles — team roster
const DEV_PROFILES = [
  { id: 'ai-engineer',  name: 'AI Engineer',    model: 'deepseek-v4-pro',   icon: 'AI' },
  { id: 'api-dev',      name: 'API Dev',         model: 'deepseek-v4-pro',   icon: 'API' },
  { id: 'bash-dev',     name: 'Bash Dev',        model: 'deepseek-v4-flash', icon: 'SH' },
  { id: 'c-cpp-dev',    name: 'C/C++ Dev',       model: 'deepseek-v4-pro',   icon: 'CPP' },
  { id: 'data-dev',     name: 'Data Dev',        model: 'deepseek-v4-flash', icon: 'DT' },
  { id: 'explorer',     name: 'Explorer',        model: 'deepseek-v4-flash', icon: 'EXP' },
  { id: 'frontend-dev', name: 'Frontend Dev',    model: 'deepseek-v4-pro',   icon: 'FE' },
  { id: 'infra-dev',    name: 'Infra Dev',       model: 'deepseek-v4-flash', icon: 'INF' },
  { id: 'python-dev',   name: 'Python Dev',      model: 'deepseek-v4-pro',   icon: 'PY' },
  { id: 'qa-engineer',  name: 'QA Engineer',     model: 'deepseek-v4-pro',   icon: 'QA' },
  { id: 'researcher',   name: 'Researcher',      model: 'kimi-k2.5',         icon: 'RCH' },
  { id: 'workflow-dev', name: 'Workflow Dev',    model: 'deepseek-v4-flash', icon: 'WF' },
];

// Multi-team configuration
const TEAMS = {
  dev: {
    id: 'dev',
    name: 'Dev Office',
    label: 'Dev',
    dbPath: process.env.DEV_KANBAN_DB || path.join(process.env.HOME || '/root', '.hermes', 'kanban.db'),
    profiles: DEV_PROFILES,
  },
  paper: {
    id: 'paper',
    name: 'Paper Office',
    label: 'Paper',
    dbPath: process.env.PAPER_KANBAN_DB || '/root/.hermes/kanban/boards/paper-lead/kanban.db',
    profiles: [
      { id: 'paper-lead',       name: 'Paper Lead',       model: 'deepseek-v4-flash', icon: 'PL' },
      { id: 'paper-researcher', name: 'Paper Researcher', model: 'kimi-k2.5',         icon: 'RCH' },
      { id: 'paper-writer',     name: 'Paper Writer',     model: 'deepseek-v4-pro',   icon: 'WR' },
      { id: 'paper-visualizer', name: 'Paper Visualizer', model: 'deepseek-v4-pro',   icon: 'VIZ' },
      { id: 'paper-reviewer',   name: 'Paper Reviewer',   model: 'deepseek-v4-pro',   icon: 'RV' },
    ],
  },
};

// ==============================
// REMOTE MODE — no native deps needed
// ==============================
if (REMOTE_BACKEND) {
  console.log(`[agent-office] Remote mode → frontend connects to ${REMOTE_BACKEND}`);

  const app = express();
  const server = http.createServer(app);

  // Serve static files with backend URL injected
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/', (req, res) => {
    let html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf-8');
    const wsUrl = REMOTE_BACKEND.replace(/^http/, 'ws');
    html = html.replace('__BACKEND_WS__', wsUrl);
    res.send(html);
  });

  server.listen(PORT, () => {
    console.log(`[agent-office] Remote client at http://localhost:${PORT}`);
    console.log(`[agent-office] WebSocket → ws://${REMOTE_BACKEND.replace(/^http:\/\//, '')}`);
  });

  process.on('SIGINT', () => process.exit(0));
  process.on('SIGTERM', () => process.exit(0));
  return;
}

// ==============================
// VPS STANDALONE MODE
// ==============================
const { WebSocketServer } = require('ws');
const Database = require('better-sqlite3');

const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || '2000', 10);

// Multi-team DB connections
const dbs = {};

function openDbs() {
  for (const [tid, team] of Object.entries(TEAMS)) {
    try {
      if (fs.existsSync(team.dbPath)) {
        dbs[tid] = new Database(team.dbPath, { readonly: true, fileMustExist: true });
        console.log(`[agent-office] [${tid}] Connected to kanban DB: ${team.dbPath}`);
      } else {
        console.warn(`[agent-office] [${tid}] Kanban DB not found at ${team.dbPath}`);
      }
    } catch (e) {
      console.error(`[agent-office] [${tid}] DB error: ${e.message}`);
    }
  }
}

function q(db, sql, params = []) {
  if (!db) return [];
  try { return db.prepare(sql).all(...params); }
  catch (e) { return []; }
}

function buildSnapshot(teamId) {
  const team = TEAMS[teamId];
  if (!team) return null;
  const db = dbs[teamId];
  if (!db) return null;

  const tasks = q(db, 'SELECT id, title, body, assignee, status, priority, tenant, created_at, started_at, completed_at, result FROM tasks ORDER BY created_at DESC LIMIT 200');
  const events = q(db, 'SELECT id, task_id, kind, payload, created_at FROM task_events ORDER BY id DESC LIMIT 100');
  const comments = q(db, 'SELECT id, task_id, author, body, created_at FROM task_comments ORDER BY id DESC LIMIT 50');
  const runs = q(db, 'SELECT id, task_id, profile, status, started_at, ended_at, outcome, summary, metadata FROM task_runs ORDER BY started_at DESC LIMIT 50');
  const links = q(db, 'SELECT parent_id, child_id FROM task_links');

  const profiles = team.profiles.map(p => {
    const activeTask = tasks.find(t => t.assignee === p.id && (t.status === 'running' || t.status === 'blocked'));
    const lastRun = runs.find(r => r.profile === p.id);
    return {
      ...p,
      status: activeTask ? activeTask.status : 'idle',
      currentTask: activeTask ? activeTask.title : null,
      currentTaskId: activeTask ? activeTask.id : null,
      lastActivity: lastRun ? lastRun.ended_at || lastRun.started_at : null,
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

function buildAllSnapshots() {
  const allData = {};
  for (const tid of Object.keys(TEAMS)) {
    allData[tid] = buildSnapshot(tid);
  }
  return allData;
}

const app = express();
const server = http.createServer(app);

app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/api/snapshot', (req, res) => res.json(buildAllSnapshots()));
app.get('/api/teams', (req, res) => {
  const list = Object.values(TEAMS).map(t => ({ id: t.id, name: t.name }));
  res.json(list);
});
app.get('/api/health', (req, res) => {
  const dbStatus = {};
  for (const tid of Object.keys(TEAMS)) {
    dbStatus[tid] = !!dbs[tid];
  }
  res.json({ ok: true, db: dbStatus, uptime: process.uptime() });
});

// WebSocket
const wss = new WebSocketServer({ server });
const lastIds = {};
for (const tid of Object.keys(TEAMS)) {
  lastIds[tid] = { eventId: 0, commentId: 0 };
}

function getDeltaForTeam(teamId) {
  const db = dbs[teamId];
  if (!db) return null;
  const ids = lastIds[teamId];
  const evts = q(db, `SELECT id, task_id, kind, payload, created_at FROM task_events WHERE id > ? ORDER BY id ASC LIMIT 500`, [ids.eventId]);
  const cmts = q(db, `SELECT id, task_id, author, body, created_at FROM task_comments WHERE id > ? ORDER BY id ASC LIMIT 200`, [ids.commentId]);
  if (evts.length > 0) { ids.eventId = evts[evts.length - 1].id; }
  if (cmts.length > 0) { ids.commentId = cmts[cmts.length - 1].id; }
  return (evts.length > 0 || cmts.length > 0);
}

function broadcast(msg) {
  if (wss.clients.size === 0) return;
  const payload = JSON.stringify(msg);
  wss.clients.forEach(c => {
    if (c.readyState === 1) {
      try {
        c.send(payload);
      } catch (e) {
        console.error(`[agent-office] Broadcast send error: ${e.message}`);
      }
    }
  });
}

wss.on('connection', (ws) => {
  console.log('[agent-office] Client connected');
  ws.on('error', (err) => {
    console.error(`[agent-office] WebSocket error: ${err.message}`);
  });
  try {
    ws.send(JSON.stringify({ type: 'snapshot', data: buildAllSnapshots() }));
  } catch (e) {
    console.error(`[agent-office] Failed to send snapshot: ${e.message}`);
  }
  ws.on('close', () => console.log('[agent-office] Client disconnected'));
});

openDbs();

// Seed last IDs per team
for (const tid of Object.keys(TEAMS)) {
  const snap = buildSnapshot(tid);
  if (snap) {
    if (snap.events.length > 0) lastIds[tid].eventId = snap.events[0].id;
    if (snap.comments.length > 0) lastIds[tid].commentId = snap.comments[0].id;
  }
}

server.listen(PORT, () => {
  console.log(`[agent-office] Server running at http://localhost:${PORT}`);
  setInterval(() => {
    try {
      let anyDelta = false;
      for (const tid of Object.keys(TEAMS)) {
        const hasDelta = getDeltaForTeam(tid);
        if (hasDelta) anyDelta = true;
      }
      if (anyDelta) {
        broadcast({ type: 'snapshot', data: buildAllSnapshots() });
      }
    } catch (e) {
      console.error(`[agent-office] Poll cycle error: ${e.message}`);
    }
  }, POLL_INTERVAL);
});

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
