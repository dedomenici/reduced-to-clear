// SQLite via sql.js (WASM, no native build needed). Persists to a file after each write.
const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS stores (
  id INTEGER PRIMARY KEY, chain TEXT NOT NULL, name TEXT NOT NULL, address TEXT,
  city TEXT, country TEXT NOT NULL DEFAULT 'GB', timezone TEXT NOT NULL DEFAULT 'Europe/London',
  lat REAL NOT NULL, lng REAL NOT NULL, opening_hours TEXT, osm_id TEXT UNIQUE,
  created_by INTEGER, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, store_id INTEGER NOT NULL,
  items TEXT NOT NULL, price_note TEXT, photo TEXT,
  seen_at TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT,
  lat REAL NOT NULL, lng REAL NOT NULL, city TEXT, country TEXT NOT NULL DEFAULT 'GB',
  currency TEXT NOT NULL DEFAULT 'GBP',
  all_gone_at TEXT, all_gone_by INTEGER);
CREATE INDEX IF NOT EXISTS posts_created ON posts(created_at);
CREATE INDEX IF NOT EXISTS posts_store ON posts(store_id);
CREATE TABLE IF NOT EXISTS chain_predictions (
  id INTEGER PRIMARY KEY, chain TEXT NOT NULL, country TEXT NOT NULL, days TEXT NOT NULL,
  start_hour REAL, end_hour REAL, label TEXT NOT NULL, confidence TEXT NOT NULL,
  source_title TEXT, source_url TEXT);
CREATE TABLE IF NOT EXISTS actions (
  id INTEGER PRIMARY KEY, user_id INTEGER, kind TEXT NOT NULL, at TEXT NOT NULL);
`;

async function openDb(file) {
  const SQL = await initSqlJs();
  const mem = file === ':memory:';
  const abs = mem ? null : path.resolve(file);
  const db = !mem && fs.existsSync(abs) ? new SQL.Database(fs.readFileSync(abs)) : new SQL.Database();
  db.run(SCHEMA);
  let timer = null;
  function save() {
    if (mem) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs + '.tmp', Buffer.from(db.export()));
      fs.renameSync(abs + '.tmp', abs);
    }, 50);
  }
  const api = {
    all(sql, params = []) {
      const st = db.prepare(sql); st.bind(params); const rows = [];
      while (st.step()) rows.push(st.getAsObject());
      st.free(); return rows;
    },
    get(sql, params = []) { return api.all(sql, params)[0]; },
    run(sql, params = []) {
      db.run(sql, params);
      const id = api.get('SELECT last_insert_rowid() AS id').id;
      const changes = db.getRowsModified();
      save();
      return { id, changes };
    },
    flush() { if (!mem) { clearTimeout(timer); fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, Buffer.from(db.export())); } },
  };
  return api;
}
module.exports = { openDb };
