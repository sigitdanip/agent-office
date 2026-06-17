// Prometheus-style metrics registry for agent-office
// Single registry pattern — all modules import the same `metrics` instance

const { log } = require('./logger');

class Counter {
  constructor(name, help, labelNames = []) {
    this.name = name;
    this.help = help;
    this.labelNames = labelNames;
    this.values = new Map(); // key: serialized labels, value: number
  }

  inc(labels = {}, n = 1) {
    const key = this._key(labels);
    this.values.set(key, (this.values.get(key) || 0) + n);
  }

  get(labels = {}) {
    return this.values.get(this._key(labels)) || 0;
  }

  _key(labels) {
    return this.labelNames.map(k => `${k}=${labels[k] || ''}`).join(',');
  }

  render() {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} counter`];
    if (this.values.size === 0) {
      lines.push(`${this.name}${this._labelString({})} 0`);
    } else {
      for (const [key, val] of this.values) {
        const labels = this._parseKey(key);
        lines.push(`${this.name}${this._labelString(labels)} ${val}`);
      }
    }
    return lines.join('\n');
  }

  _labelString(labels) {
    const pairs = this.labelNames.map(k => `${k}="${labels[k] || ''}"`).join(',');
    return pairs ? `{${pairs}}` : '';
  }

  _parseKey(key) {
    if (!key) return {};
    const obj = {};
    key.split(',').forEach(pair => {
      const [k, v] = pair.split('=');
      if (k) obj[k] = v || '';
    });
    return obj;
  }
}

class Gauge {
  constructor(name, help, labelNames = []) {
    this.name = name;
    this.help = help;
    this.labelNames = labelNames;
    this.values = new Map();
  }

  set(labels = {}, val) {
    const key = this._key(labels);
    this.values.set(key, val);
  }

  inc(labels = {}, n = 1) {
    const key = this._key(labels);
    this.values.set(key, (this.values.get(key) || 0) + n);
  }

  dec(labels = {}, n = 1) {
    this.inc(labels, -n);
  }

  get(labels = {}) {
    return this.values.get(this._key(labels)) || 0;
  }

  _key(labels) { return this.labelNames.map(k => `${k}=${labels[k] || ''}`).join(','); }

  render() {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} gauge`];
    if (this.values.size === 0) {
      lines.push(`${this.name}${this._labelString({})} 0`);
    } else {
      for (const [key, val] of this.values) {
        const labels = this._parseKey(key);
        lines.push(`${this.name}${this._labelString(labels)} ${val}`);
      }
    }
    return lines.join('\n');
  }

  _labelString(labels) {
    const pairs = this.labelNames.map(k => `${k}="${labels[k] || ''}"`).join(',');
    return pairs ? `{${pairs}}` : '';
  }

  _parseKey(key) {
    if (!key) return {};
    const obj = {};
    key.split(',').forEach(pair => {
      const [k, v] = pair.split('=');
      if (k) obj[k] = v || '';
    });
    return obj;
  }
}

class Histogram {
  constructor(name, help, buckets = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000]) {
    this.name = name;
    this.help = help;
    this.buckets = buckets.sort((a, b) => a - b);
    // Single-label histogram: no labelNames for simplicity
    this.count = 0;
    this.sum = 0;
    this.bucketCounts = new Map();
    this.buckets.forEach(b => this.bucketCounts.set(b, 0));
    this.bucketCounts.set('+Inf', 0);
  }

  observe(val) {
    this.count++;
    this.sum += val;
    for (const b of this.buckets) {
      if (val <= b) {
        this.bucketCounts.set(b, (this.bucketCounts.get(b) || 0) + 1);
      }
    }
    this.bucketCounts.set('+Inf', this.count);
  }

  render() {
    const lines = [
      `# HELP ${this.name} ${this.help}`,
      `# TYPE ${this.name} histogram`,
    ];
    for (const b of this.buckets) {
      lines.push(`${this.name}_bucket{le="${b}"} ${this.bucketCounts.get(b) || 0}`);
    }
    lines.push(`${this.name}_bucket{le="+Inf"} ${this.bucketCounts.get('+Inf')}`);
    lines.push(`${this.name}_sum ${this.sum}`);
    lines.push(`${this.name}_count ${this.count}`);
    return lines.join('\n');
  }
}

// ---- The singleton registry ----
class MetricsRegistry {
  constructor() {
    this.metrics = new Map();
    // HTTP request tracking — dimensioned by method + route + status
    this._register('http_requests_total', new Counter('http_requests_total', 'Total HTTP requests', ['method', 'route', 'status']));
    this._register('http_request_duration_ms', new Histogram('http_request_duration_ms', 'HTTP request duration in ms'));
    // DB query tracking
    this._register('db_queries_total', new Counter('db_queries_total', 'Total DB queries', ['team', 'type']));
    this._register('db_query_duration_ms', new Histogram('db_query_duration_ms', 'DB query duration in ms'));
    this._register('slow_queries_total', new Counter('slow_queries_total', 'Queries exceeding 100ms threshold', ['team']));
    // Snapshot tracking
    this._register('snapshot_build_duration_ms', new Histogram('snapshot_build_duration_ms', 'Snapshot build duration in ms'));
    this._register('snapshot_builds_total', new Counter('snapshot_builds_total', 'Total snapshot builds'));
    // WebSocket
    this._register('websocket_clients', new Gauge('websocket_clients', 'Active WebSocket clients'));
    this._register('websocket_connections_total', new Counter('websocket_connections_total', 'Total WebSocket connections'));
    this._register('websocket_disconnections_total', new Counter('websocket_disconnections_total', 'Total WebSocket disconnections'));
    // Process / system
    this._register('db_connections', new Gauge('db_connections', 'Active database connections'));
    this._register('uptime_seconds', new Gauge('uptime_seconds', 'Process uptime in seconds'));
    this._register('memory_bytes', new Gauge('memory_bytes', 'Memory usage', ['type']));
  }

  _register(name, metric) {
    this.metrics.set(name, metric);
  }

  get(name) {
    return this.metrics.get(name);
  }

  // Update process-level gauges
  updateProcess() {
    const mem = process.memoryUsage();
    this.get('memory_bytes').set({ type: 'rss' }, mem.rss);
    this.get('memory_bytes').set({ type: 'heapTotal' }, mem.heapTotal);
    this.get('memory_bytes').set({ type: 'heapUsed' }, mem.heapUsed);
    this.get('memory_bytes').set({ type: 'external' }, mem.external);
    this.get('uptime_seconds').set({}, process.uptime());
  }

  // Render all as Prometheus text format
  render() {
    this.updateProcess();
    const parts = [];
    for (const metric of this.metrics.values()) {
      parts.push(metric.render());
    }
    return parts.join('\n\n') + '\n';
  }
}

// Export singleton instance
const metrics = new MetricsRegistry();

module.exports = { metrics, Counter, Gauge, Histogram };
