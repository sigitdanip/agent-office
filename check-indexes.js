const Database = require('better-sqlite3');
const db = new Database('/root/.hermes/kanban.db', { readonly: true, fileMustExist: true });
const indices = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'").all();
console.log(JSON.stringify(indices, null, 2));
db.close();
