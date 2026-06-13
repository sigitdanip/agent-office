require('dotenv').config();
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const PORT = process.env.PORT || 3000;
const REMOTE_BACKEND = process.env.REMOTE_BACKEND || null;
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || '2000', 10);
const PROFILES_DIR = process.env.HERMES_PROFILES_DIR || '/root/.hermes/profiles/';
const METADATA_CACHE_TTL = 60000; // 60 seconds

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
  'paper-technical': 'PT',
  'paper-lead': 'PL',
};

function discoverProfiles() {
  const ids = fs.readdirSync(PROFILES_DIR).filter(d => fs.statSync(path.join(PROFILES_DIR, d)).isDirectory()).sort();
  const dev = [];
  const paper = [];
  for (const id of ids) {
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

// Profile metadata cache — avoids re-reading config.yaml on every snapshot build
const metadataCache = {};

function getProfileMetadata(profileId) {
  const now = Date.now();
  const entry = metadataCache[profileId];
  if (entry && (now - entry.timestamp) < METADATA_CACHE_TTL) {
    return entry.data;
  }

  const profileDir = path.join(PROFILES_DIR, profileId);
  const data = {};

  // Parse config.yaml
  try {
    const configPath = path.join(profileDir, 'config.yaml');
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8');
      const cfg = yaml.load(raw) || {};

      if (cfg.model) {
        data.provider = cfg.model.provider || null;
        data.baseUrl = cfg.model.base_url || null;
      }
      if (cfg.agent) {
        data.maxTurns = cfg.agent.max_turns || null;
        data.disabledToolsets = cfg.agent.disabled_toolsets || [];
        data.reasoningEffort = cfg.agent.reasoning_effort || null;
      }
      data.goalMode = (cfg.goals && cfg.goals.max_turns > 0) || false;
      data.toolsets = cfg.toolsets || [];
      if (cfg.terminal) {
        data.terminalBackend = cfg.terminal.backend || null;
      }
      if (cfg.display) {
        data.personality = cfg.display.personality || null;
      }
      if (cfg.memory) {
        data.memoryEnabled = cfg.memory.memory_enabled !== false;
      }
      if (cfg.delegation) {
        data.maxConcurrentChildren = cfg.delegation.max_concurrent_children || null;
        data.maxSpawnDepth = cfg.delegation.max_spawn_depth || null;
      }
    }
  } catch (e) {
    // Config read failures are non-fatal — return bare data
    console.error(`[agent-office] Failed to parse config for ${profileId}: ${e.message}`);
  }

  // Parse profile.yaml for description
  try {
    const profileYamlPath = path.join(profileDir, 'profile.yaml');
    if (fs.existsSync(profileYamlPath)) {
      const raw = fs.readFileSync(profileYamlPath, 'utf-8');
      const py = yaml.load(raw) || {};
      data.description = py.description || null;
    }
  } catch (e) {
    // Non-fatal
  }

  metadataCache[profileId] = { timestamp: now, data };
  return data;
}

module.exports = { PORT, REMOTE_BACKEND, POLL_INTERVAL, TEAMS, COLUMNS, COLUMN_LABELS, discoverProfiles, getProfileMetadata, METADATA_CACHE_TTL };
