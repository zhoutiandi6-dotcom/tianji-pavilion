const sqlite = require('node:sqlite');
const path = require('path');
const databasePath = path.resolve(process.argv[2] || '');
if (!databasePath) throw new Error('database path is required');
const db = new sqlite.DatabaseSync(databasePath, { readOnly: true });
try {
  const integrityCheck = db.prepare('PRAGMA integrity_check').all().map((row) => Object.values(row)[0]);
  const journalMode = db.prepare('PRAGMA journal_mode').get();
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map((row) => row.name);
  const requiredTables = ['users', 'tasks', 'image_tasks', 'attachments', 'approval_records', 'weekly_plan_items'];
  const missingTables = requiredTables.filter((name) => !tables.includes(name));
  const counts = Object.fromEntries(requiredTables.map((name) => [name, Number(db.prepare(`SELECT COUNT(*) AS count FROM ${name}`).get().count)]));
  console.log(JSON.stringify({ databasePath, integrityCheck, journalMode: Object.values(journalMode)[0], tables, missingTables, counts }, null, 2));
  if (integrityCheck.length !== 1 || integrityCheck[0] !== 'ok' || missingTables.length) process.exitCode = 1;
} finally { db.close(); }
