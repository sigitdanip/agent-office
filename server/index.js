#!/usr/bin/env node
// Agent Office server - orchestrator

const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');

process.on('uncaughtException', (err) => {
  console.error('[agent-office] UNCAUGHT EXCEPTION:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[agent-office] UNHANDLED REJECTION:', reason);
});

const config = require('./config');
const DatabaseManager = require('./db');
const { createRouter } = require('./routes');
const WebSocketManager = require('./ws');

if (config.REMOTE_BACKEND) {
  console.log('[agent-office] Remote mode - frontend connects to ' + config.REMOTE_BACKEND);
  const app = express();
  const server = http.createServer(app);
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.get('/', (req, res) => {
    let html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf-8');
    const wsUrl = config.REMOTE_BACKEND.replace(/^http/, 'ws');
    html = html.replace('__BACKEND_WS__', wsUrl);
    res.send(html);
  });
  server.listen(config.PORT, () => {
    console.log('[agent-office] Remote client at http://localhost:' + config.PORT);
  });
  process.on('SIGINT', () => process.exit(0));
  process.on('SIGTERM', () => process.exit(0));
  return;
}

const db = new DatabaseManager(config);
db.connectAll();

const app = express();
const server = http.createServer(app);
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/api', createRouter(db, config));

const ws = new WebSocketManager(server, db, config);
ws.start();

server.listen(config.PORT, () => {
  console.log('[agent-office] Server running at http://localhost:' + config.PORT);
});

function shutdown(signal) {
  console.log('[agent-office] Received ' + signal + ', shutting down gracefully...');
  ws.stop();
  server.close();
  db.disconnectAll();
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
