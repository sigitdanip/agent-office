#!/usr/bin/env node
// Agent Office server
// VPS mode: reads kanban DB directly, serves REST + WebSocket
// Remote mode: serves static files, frontend connects to VPS backend

const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || 3000;
const REMOTE_BACKEND = process.env.REMOTE_BACKEND || null;

// Profiles — team roster
const PROFILES = [
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
const KANBAN_DB = process.env.KANBAN_DB || path.join(process.env.HOME || '/root', '.hermes', 'kanban.db');

let db = null;
function openDb() {
  try {
    if (fs.existsSync(KANBAN_DB)) {
      db = new Database(KANBAN_DB, { readonly: true, fileMustExist: true });
      console.log(`[agent-office] Connected to kanban DB: ${KANBAN_DB}`);
      return true;
    }
    console.warn(`[agent-office] Kanban DB not found at ${KANBAN_DB}`);
    return false;
  } catch (e) {
    console.error(`[agent-office] DB error: ${e.message}`);
    return false;
  }
}

function q(sql, params = []) {
  if (!db) return [];
  try { return db.prepare(sql).all(...params); }
  catch (e) { return []; }
}

function buildSnapshot() {
  const tasks = q('SELECT id, title, body, assignee, status, priority, tenant, created_at, started_at, completed_at, result FROM tasks ORDER BY created_at DESC LIMIT 200');
  const events = q('SELECT id, task_id, kind, payload, created_at FROM task_events ORDER BY id DESC LIMIT 100');
  const comments = q('SELECT id, task_id, author, body, created_at FROM task_comments ORDER BY id DESC LIMIT 50');
  const runs = q('SELECT id, task_id, profile, status, started_at, ended_at, outcome, summary, metadata FROM task_runs ORDER BY started_at DESC LIMIT 50');
  const links = q('SELECT parent_id, child_id FROM task_links');

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

const app = express();
const server = http.createServer(app);

app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/api/snapshot', (req, res) => res.json(buildSnapshot()));
app.get('/api/health', (req, res) => res.json({ ok: true, db: !!db, uptime: process.uptime() }));

// WebSocket
const wss = new WebSocketServer({ server });
let lastEventId = 0;
let lastCommentId = 0;

function getDelta() {
  const evts = q(`SELECT id, task_id, kind, payload, created_at FROM task_events WHERE id > ? ORDER BY id ASC LIMIT 500`, [lastEventId]);
  const cmts = q(`SELECT id, task_id, author, body, created_at FROM task_comments WHERE id > ? ORDER BY id ASC LIMIT 200`, [lastCommentId]);
  const delta = {};
  if (evts.length > 0) { delta.newEvents = evts; lastEventId = evts[evts.length - 1].id; }
  if (cmts.length > 0) { delta.newComments = cmts; lastCommentId = cmts[cmts.length - 1].id; }
  if (evts.length > 0 || cmts.length > 0) delta.fullSnapshot = buildSnapshot();
  return delta;
}

function broadcast(msg) {
  const payload = JSON.stringify(msg);
  wss.clients.forEach(c => { if (c.readyState === 1) c.send(payload); });
}

wss.on('connection', (ws) => {
  console.log('[agent-office] Client connected');
  ws.send(JSON.stringify({ type: 'snapshot', data: buildSnapshot() }));
  ws.on('close', () => console.log('[agent-office] Client disconnected'));
});

openDb();

// Seed last IDs
const snap = buildSnapshot();
if (snap.events.length > 0) lastEventId = snap.events[0].id;
if (snap.comments.length > 0) lastCommentId = snap.comments[0].id;

server.listen(PORT, () => {
  console.log(`[agent-office] Server running at http://localhost:${PORT}`);
  setInterval(() => { const d = getDelta(); if (Object.keys(d).length > 0) broadcast({ type: 'delta', data: d }); }, POLL_INTERVAL);
});

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
