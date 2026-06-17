// Syntax check all server files
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const files = ['index.js', 'db.js', 'ws.js', 'routes.js', 'config.js'];
const serverDir = '/root/agent-office/server';

for (const f of files) {
  const filePath = path.join(serverDir, f);
  try {
    const code = fs.readFileSync(filePath, 'utf-8');
    new vm.Script(code, { filename: f });
    console.log(`OK: ${f}`);
  } catch (e) {
    console.log(`FAIL: ${f} - ${e.message}`);
  }
}
