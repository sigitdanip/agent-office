// Syntax check all server files
const files = [
  'server/logger.js',
  'server/metrics.js',
  'server/db.js',
  'server/routes.js',
  'server/index.js',
  'server/ws.js',
];

let allOk = true;
for (const f of files) {
  try {
    require('./' + f);
    console.log(`OK: ${f}`);
  } catch (e) {
    console.error(`FAIL: ${f} - ${e.message}`);
    allOk = false;
  }
}

if (allOk) {
  // Quick functional test
  const { log } = require('./server/logger');
  const { metrics } = require('./server/metrics');

  log.info('smoke-test', { ok: true });

  metrics.get('http_requests_total').inc({ method: 'GET', route: '/test', status: '200' });
  metrics.get('http_request_duration_ms').observe(42);
  metrics.get('db_query_duration_ms').observe(15);
  metrics.get('slow_queries_total').inc({ team: 'dev' });
  metrics.get('websocket_clients').set({}, 3);
  metrics.get('db_connections').set({}, 2);

  const output = metrics.render();
  console.log('\n=== Prometheus output (first 500 chars) ===');
  console.log(output.slice(0, 500));
  console.log('...');
  console.log('\nALL CHECKS PASSED');
} else {
  process.exit(1);
}
