#!/usr/bin/env node
// Agent Office server - orchestrator

const express = require('express');
const compression = require('compression');
const http = require('http');
const path = require('path');
const fs = require('fs');

const { log } = require('./logger');
const { metrics } = require('./metrics');

process.on('uncaughtException', (err) => {
  log.error('UNCAUGHT EXCEPTION', { error: err.message, stack: err.stack });
});
process.on('unhandledRejection', (reason) => {
  log.error('UNHANDLED REJECTION', { error: reason instanceof Error ? reason.message : String(reason) });
});

const config = require('./config');
const DatabaseManager = require('./db');
const { createRouter } = require('./routes');
const WebSocketManager = require('./ws');

if (config.REMOTE_BACKEND) {
  log.info('Starting in remote mode', { backend: config.REMOTE_BACKEND });
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
    log.info('Remote client started', { port: config.PORT });
  });
  process.on('SIGINT', () => process.exit(0));
  process.on('SIGTERM', () => process.exit(0));
  return;
}

log.info('Starting Agent Office server');

const db = new DatabaseManager(config);
db.connectAll();

const app = express();
const server = http.createServer(app);

// ---- Request timing middleware ----
app.use((req, res, next) => {
  const start = performance.now();
  // Normalize route for metrics (avoid cardinality explosion from IDs)
  let route = req.path;
  route = route.replace(/\/[a-f0-9-]{36}/g, '/:uuid');     // UUIDs
  route = route.replace(/\/[a-f0-9]{24,}/g, '/:id');        // long IDs
  route = route.replace(/\/\d+/g, '/:num');                  // numeric IDs

  // Capture original end to track status
  const originalEnd = res.end;
  res.end = function (...args) {
    const duration = performance.now() - start;
    metrics.get('http_requests_total').inc({ method: req.method, route, status: String(res.statusCode) });
    metrics.get('http_request_duration_ms').observe(duration);
    log.info('request', {
      method: req.method,
      path: req.path,
      route,
      status: res.statusCode,
      duration_ms: Math.round(duration),
    });
    originalEnd.apply(res, args);
  };
  next();
});

app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(express.json());
app.use(compression({ threshold: 1024 })); // gzip responses > 1KB
app.use('/api', createRouter(db, config));

const ws = new WebSocketManager(server, db, config);
ws.start();

server.listen(config.PORT, () => {
  log.info('Server running', { port: config.PORT });
});

function shutdown(signal) {
  log.info('Shutting down', { signal });
  ws.stop();
  server.close();
  db.disconnectAll();
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
