// Load test - verify key modules work
try {
  const config = require('./server/config');
  console.log('config OK - teams:', Object.keys(config.TEAMS));
} catch (e) {
  console.log('config FAIL:', e.message);
}

try {
  const DatabaseManager = require('./server/db');
  console.log('db.js module OK');
} catch (e) {
  console.log('db.js FAIL:', e.message);
}

try {
  const { createRouter } = require('./server/routes');
  console.log('routes.js module OK');
} catch (e) {
  console.log('routes.js FAIL:', e.message);
}

try {
  const WebSocketManager = require('./server/ws');
  console.log('ws.js module OK');
} catch (e) {
  console.log('ws.js FAIL:', e.message);
}

console.log('All module checks done');
