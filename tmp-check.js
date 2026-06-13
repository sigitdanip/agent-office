const Database = require('better-sqlite3');
const db = new Database('/root/.hermes/kanban.db', { readonly: true, fileMustExist: true });

const rows = db.prepare("SELECT id, kind, substr(payload,1,300) as payload_preview, created_at FROM task_events WHERE task_id='t_595744b0' AND kind='heartbeat' ORDER BY id DESC LIMIT 3").all();
console.log(JSON.stringify(rows, null, 2));

db.close();
