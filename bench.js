const http = require('http');

const HOST = 'localhost';
const PORT = 3000;
const ITERATIONS = 100;

function fetch(path, headers = {}) {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    const req = http.get(`http://${HOST}:${PORT}${path}`, { headers }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const duration = performance.now() - start;
        resolve({
          status: res.statusCode,
          size: data.length,
          data: data,
          duration,
          headers: res.headers,
        });
      });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function percentile(sorted, p) {
  const idx = Math.ceil(sorted.length * p / 100) - 1;
  return sorted[Math.max(0, idx)];
}

async function main() {
  // 1. Snapshot benchmark
  console.log('=== /api/snapshot benchmark (100 requests, gzip) ===');
  const snapTimes = [];
  let snapSize = 0;
  for (let i = 0; i < ITERATIONS; i++) {
    const r = await fetch('/api/snapshot', { 'Accept-Encoding': 'gzip' });
    snapTimes.push(r.duration);
    snapSize = r.size;
  }
  snapTimes.sort((a, b) => a - b);
  console.log(`  min:   ${snapTimes[0].toFixed(1)}ms`);
  console.log(`  p50:   ${percentile(snapTimes, 50).toFixed(1)}ms`);
  console.log(`  p95:   ${percentile(snapTimes, 95).toFixed(1)}ms`);
  console.log(`  p99:   ${percentile(snapTimes, 99).toFixed(1)}ms`);
  console.log(`  max:   ${snapTimes[snapTimes.length-1].toFixed(1)}ms`);
  console.log(`  size:  ${snapSize} bytes (compressed)`);

  // Also test without gzip for comparison
  console.log('\n=== /api/snapshot (no gzip) ===');
  const noGzip = await fetch('/api/snapshot');
  console.log(`  size: ${noGzip.size} bytes (uncompressed)`);
  console.log(`  ratio: ${(noGzip.size / snapSize).toFixed(1)}x`);

  // 2. Check caching headers
  console.log('\n=== Caching headers ===');
  const teams = await fetch('/api/teams');
  console.log(`  /api/teams  Cache-Control: ${teams.headers['cache-control']}`);
  console.log(`  /api/teams  Content-Encoding: ${teams.headers['content-encoding'] || 'none'}`);

  const health = await fetch('/api/health');
  console.log(`  /api/health Cache-Control: ${health.headers['cache-control']}`);

  const snap = await fetch('/api/snapshot', { 'Accept-Encoding': 'gzip' });
  console.log(`  /api/snapshot Cache-Control: ${snap.headers['cache-control']}`);
  console.log(`  /api/snapshot Content-Encoding: ${snap.headers['content-encoding']}`);

  // 3. Memory
  console.log('\n=== Memory ===');
  const h = JSON.parse(health.data);
  if (h.memory) {
    console.log(`  rss: ${h.memory.rss_mb}MB, heap: ${h.memory.heap_used_mb}/${h.memory.heap_total_mb}MB`);
    console.log(`  uptime: ${h.uptime_human}`);
  }
  console.log(`  status: ${h.status}`);
}

main().catch(e => console.error('Error:', e.message));
