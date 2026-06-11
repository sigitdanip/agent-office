require('dotenv').config();
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const REMOTE_BACKEND = process.env.REMOTE_BACKEND || null;
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || '2000', 10);
const PROFILES_DIR = process.env.HERMES_PROFILES_DIR || '/root/.hermes/profiles/';

// Overrides for names/icons that auto-derivation can't get right
const NAME_OVERRIDES = {
  'ai-engineer': 'AI Engineer',
  'api-dev': 'API Dev',
  'c-cpp-dev': 'C/C++ Dev',
  'qa-engineer': 'QA Engineer',
};
const ICON_OVERRIDES = {
  'ai-engineer': 'AI',
  'api-dev': 'API',
  'bash-dev': 'SH',
  'c-cpp-dev': 'CPP',
  'data-dev': 'DT',
  'explorer': 'EXP',
  'frontend-dev': 'FE',
  'infra-dev': 'INF',
  'python-dev': 'PY',
  'qa-engineer': 'QA',
  'researcher': 'RCH',
  'workflow-dev': 'WF',
  'paper-researcher': 'RCH',
  'paper-reviewer': 'RV',
  'paper-visualizer': 'VIZ',
  'paper-writer': 'WR',
};

function discoverProfiles() {
  const ids = fs.readdirSync(PROFILES_DIR).filter(d => fs.statSync(path.join(PROFILES_DIR, d)).isDirectory()).sort();
  const dev = [];
  const paper = [];
  for (const id of ids) {
    if (id === 'dev-lead') continue;
    let model = 'unknown';
    try {
      const raw = fs.readFileSync(path.join(PROFILES_DIR, id, 'config.yaml'), 'utf-8');
      const m = raw.match(/^  default:\s*(\S+)/m);
      if (m) model = m[1];
    } catch (e) {}
    const name = NAME_OVERRIDES[id] || id.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    const icon = ICON_OVERRIDES[id] || id.split('-').map(w => w.charAt(0).toUpperCase()).join('').slice(0, 3);
    const entry = { id, name, model, icon };
    if (id.startsWith('paper-')) paper.push(entry);
    else dev.push(entry);
  }
  return { dev, paper };
}

const discovered = discoverProfiles();

const TEAMS = {
  dev: {
    id: 'dev', name: 'Dev Office', label: 'Dev',
    dbPath: process.env.DEV_KANBAN_DB || '/root/.hermes/kanban.db',
    profiles: discovered.dev,
  },
  paper: {
    id: 'paper', name: 'Paper Office', label: 'Paper',
    dbPath: process.env.PAPER_KANBAN_DB || '/root/.hermes/kanban/boards/paper-lead/kanban.db',
    profiles: discovered.paper,
  },
};

const COLUMNS = ['parking-lot', 'brainstorm', 'triage', 'todo', 'ready', 'running', 'blocked', 'done'];
const COLUMN_LABELS = {
  'parking-lot': 'Parking Lot', brainstorm: 'Brainstorm', triage: 'Triage', todo: 'Todo',
  ready: 'Ready', running: 'Running', blocked: 'Blocked', done: 'Done',
};

module.exports = { PORT, REMOTE_BACKEND, POLL_INTERVAL, TEAMS, COLUMNS, COLUMN_LABELS, discoverProfiles };
