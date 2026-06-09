#!/usr/bin/env node
// Agent Office server — reads Hermes kanban DB, serves REST + WebSocket

const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const fs = require('fs');

// ---- Config ----
const PORT = process.env.PORT || 3000;
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || '2000', 10);
const KANBAN_DB = process.env.KANBAN_DB || path.join(process.env.HOME || '/root', '.hermes', 'kanban.db');

// ---- Profiles (hardcoded from current team setup) ----
const PROFILES = [
  { id: 'ai-engineer',  name: 'AI Engineer',    model: 'deepseek-v4-pro',   icon: '🤖' },
  { id: 'api-dev',      name: 'API Dev',         model: 'deepseek-v4-pro',   icon: '🔌' },
  { id: 'bash-dev',     name: 'Bash Dev',        model: 'deepseek-v4-flash', icon: '🐚' },
  { id: 'c-cpp-dev',    name: 'C/C++ Dev',       model: 'deepseek-v4-pro',   icon: '⚙️' },
  { id: 'data-dev',     name: 'Data Dev',        model: 'deepseek-v4-flash', icon: '📊' },
  { id: 'explorer',     name: 'Explorer',        model: 'deepseek-v4-flash', icon: '🔍' },
  { id: 'frontend-dev', name: 'Frontend Dev',    model: 'deepseek-v4-pro',   icon: '🎨' },
  { id: 'infra-dev',    name: 'Infra Dev',       model: 'deepseek-v4-flash', icon: '🏗️' },
  { id: 'python-dev',   name: 'Python Dev',      model: 'deepseek-v4-pro',   icon: '🐍' },
  { id: 'qa-engineer',  name: 'QA Engineer',     model: 'deepseek-v4-pro',   icon: '🧪' },
  { id: 'researcher',   name: 'Researcher',      model: 'kimi-k2.5',         icon: '📝' },
  { id: 'workflow-dev', name: 'Workflow Dev',    model: 'deepseek-v4-flash', icon: '🔗' },
];

// ---- SQLite helpers ----
let db = null;
function openDb() {
  try {
    if (fs.existsSync(KANBAN_DB)) {
      const Database = require('better-sqlite3');
      db = new Database(KANBAN_DB, { readonly: true, fileMustExist: true });
      console.log(`[agent-office] Connected to kanban DB: ${KANBAN_DB}`);
      return true;
    }
    console.error(`[agent-office] Kanban DB not found at: ${KANBAN_DB}`);
    return false;
  } catch (e) {
    console.error(`[agent-office] Failed to open kanban DB: ${e.message}`);
    return false;
  }
}

function queryTasks() {
  if (!db) return [];
  try {
    return db.prepare(`
      SELECT id, title, body, assignee, status, priority, tenant,
             created_at, started_at, completed_at, result
      FROM tasks ORDER BY created_at DESC LIMIT 200
    `).all();
  } catch (e) { return []; }
}

function queryEvents(sinceId = 0) {
  if (!db) return { events: [], maxId: 0 };
  try {
    const events = db.prepare(`
      SELECT id, task_id, kind, payload, created_at
      FROM task_events WHERE id > ? ORDER BY id ASC LIMIT 500
    `).all(sinceId);
    const maxId = events.length > 0 ? events[events.length - 1].id : sinceId;
    return { events, maxId };
  } catch (e) { return { events: [], maxId: sinceId }; }
}

function queryComments(sinceId = 0) {
  if (!db) return { comments: [], maxId: 0 };
  try {
    const comments = db.prepare(`
      SELECT id, task_id, author, body, created_at
      FROM task_comments WHERE id > ? ORDER BY id ASC LIMIT 200
    `).all(sinceId);
    const maxId = comments.length > 0 ? comments[comments.length - 1].id : sinceId;
    return { comments, maxId };
  } catch (e) { return { comments: [], maxId: sinceId }; }
}

function queryRuns() {
  if (!db) return [];
  try {
    return db.prepare(`
      SELECT id, task_id, profile, status, started_at, ended_at, outcome, summary, metadata
      FROM task_runs ORDER BY started_at DESC LIMIT 100
    `).all();
  } catch (e) { return []; }
}

function queryTaskLinks() {
  if (!db) return [];
  try {
    return db.prepare(`SELECT parent_id, child_id FROM task_links`).all();
  } catch (e) { return []; }
}

// ---- Build snapshot ----
function buildSnapshot() {
  const tasks = queryTasks();
  const { events } = queryEvents(0);
  const { comments } = queryComments(0);
  const runs = queryRuns();
  const links = queryTaskLinks();

  // Compute profile statuses from running/blocked tasks
  const profiles = PROFILES.map(p => {
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

  // Standup stats
  const byStatus = {};
  tasks.forEach(t => {
    if (t.status === 'done' && t.completed_at && t.completed_at < Date.now() / 1000 - 86400) return; // skip old done
    byStatus[t.status] = (byStatus[t.status] || 0) + 1;
  });
  const byProfile = {};
  tasks.filter(t => t.status !== 'done').forEach(t => {
    if (t.assignee) {
      byProfile[t.assignee] = byProfile[t.assignee] || { running: 0, blocked: 0, todo: 0 };
      if (byProfile[t.assignee][t.status] !== undefined) byProfile[t.assignee][t.status]++;
    }
  });

  return {
    profiles,
    tasks,
    events: events.slice(-100), // last 100
    comments: comments.slice(-50),
    runs: runs.slice(-50),
    links,
    standup: {
      totalTasks: tasks.length,
      byStatus,
      byProfile,
      blockers: tasks.filter(t => t.status === 'blocked'),
    },
    serverTime: Date.now(),
  };
}

// ---- Express app ----
const app = express();
const server = http.createServer(app);

// Serve static files
app.use(express.static(path.join(__dirname, '..', 'public')));

// REST: snapshot
app.get('/api/snapshot', (req, res) => {
  res.json(buildSnapshot());
});

// REST: health
app.get('/api/health', (req, res) => {
  res.json({ ok: true, db: !!db, uptime: process.uptime() });
});

// ---- WebSocket ----
const wss = new WebSocketServer({ server });

// State tracking for deltas
let lastEventId = 0;
let lastCommentId = 0;
let lastPoll = 0;

function getDelta() {
  const { events, maxId: eventMax } = queryEvents(lastEventId);
  const { comments, maxId: commentMax } = queryComments(lastCommentId);

  const delta = {};
  if (events.length > 0) delta.newEvents = events;
  if (comments.length > 0) delta.newComments = comments;

  if (events.length > 0 || comments.length > 0) {
    if (events.length > 0) lastEventId = eventMax;
    if (comments.length > 0) lastCommentId = commentMax;
    // Check if full refresh needed (task status change)
    delta.fullSnapshot = buildSnapshot();
  }

  return delta;
}

let pollTimer = null;

function startPolling() {
  if (pollTimer) return;
  console.log(`[agent-office] Starting DB poll every ${POLL_INTERVAL}ms`);

  // Initial seed
  const snap = buildSnapshot();
  lastEventId = snap.events.length > 0 ? snap.events[snap.events.length - 1].id : 0;
  lastCommentId = snap.comments.length > 0 ? snap.comments[snap.comments.length - 1].id : 0;

  broadcast({ type: 'snapshot', data: snap });

  pollTimer = setInterval(() => {
    const delta = getDelta();
    if (Object.keys(delta).length > 0) {
      broadcast({ type: 'delta', data: delta });
    }
  }, POLL_INTERVAL);
}

function broadcast(msg) {
  const payload = JSON.stringify(msg);
  wss.clients.forEach(client => {
    if (client.readyState === 1) {
      client.send(payload);
    }
  });
}

wss.on('connection', (ws) => {
  console.log('[agent-office] Client connected');

  // Send current snapshot immediately
  const snap = buildSnapshot();
  ws.send(JSON.stringify({ type: 'snapshot', data: snap }));

  ws.on('close', () => {
    console.log('[agent-office] Client disconnected');
  });
});

// ---- Start ----
if (!openDb()) {
  console.warn('[agent-office] Starting without kanban DB — UI will show empty state.');
}

server.listen(PORT, () => {
  console.log(`[agent-office] Server running at http://localhost:${PORT}`);
  startPolling();
});
