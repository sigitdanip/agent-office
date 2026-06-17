// Structured JSON logger for agent-office
// Outputs all logs as single-line JSON to stdout

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const DEFAULT_LEVEL = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

class Logger {
  constructor(name) {
    this.name = name;
    this.minLevel = LEVELS[DEFAULT_LEVEL] || LEVELS.info;
  }

  _write(level, message, extra = {}) {
    if (LEVELS[level] < this.minLevel) return;
    const entry = {
      ts: new Date().toISOString(),
      level,
      name: this.name,
      msg: message,
      ...extra,
    };
    process.stdout.write(JSON.stringify(entry) + '\n');
  }

  debug(msg, extra) { this._write('debug', msg, extra); }
  info(msg, extra) { this._write('info', msg, extra); }
  warn(msg, extra) { this._write('warn', msg, extra); }
  error(msg, extra) { this._write('error', msg, extra); }
}

// Create a singleton root logger
const log = new Logger('agent-office');

module.exports = { Logger, log, LEVELS };
