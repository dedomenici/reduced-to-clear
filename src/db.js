// Database layer with one async API over two backends:
//   - Turso / libSQL (@libsql/client) when TURSO_DATABASE_URL (+ TURSO_AUTH_TOKEN) are set  -> hosted, persistent, free tier
//   - local SQLite file via sql.js (WASM, no native build) otherwise                          -> local dev / tests
// API: all(sql, params) -> rows[], get(sql, params) -> row|undefined, run(sql, params) -> {id, changes},
//      batch([[sql, params], ...]) (atomic where supported), flush(), close(), kind
const fs = require('fs');
const path = require('path');

// Ordered migrations. Never edit an applied migration; append a new one.
const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS users (
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
     id INTEGER PRIMARY KEY, user_id INTEGER, kind TEXT NOT NULL, at TEXT NOT NULL);`,
  // 2: indexes for geo bounding-box lookups and session cleanup
  `CREATE INDEX IF NOT EXISTS stores_latlng ON stores(lat, lng);
   CREATE INDEX IF NOT EXISTS posts_latlng ON posts(lat, lng);
   CREATE INDEX IF NOT EXISTS actions_user_kind ON actions(user_id, kind, at);`,
  // 3: photos stored in the database (BLOB), so hosted/free deployments don't need a disk
  `CREATE TABLE IF NOT EXISTS photos (
     id TEXT PRIMARY KEY, mime TEXT NOT NULL, bytes INTEGER NOT NULL, data BLOB NOT NULL, created_at TEXT NOT NULL);`,
];

async function migrate(db) {
  await db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
  const row = await db.get('SELECT MAX(version) AS v FROM schema_migrations');
  const current = (row && row.v) || 0;
  for (let i = current; i < MIGRATIONS.length; i++) {
    await db.exec(MIGRATIONS[i]);
    await db.run('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)', [i + 1, new Date().toISOString()]);
  }
  return MIGRATIONS.length;
}

// ---------- sql.js (local file) ----------
async function openSqlJs(file) {
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();
  const mem = file === ':memory:';
  const abs = mem ? null : path.resolve(file);
  const db = !mem && fs.existsSync(abs) ? new SQL.Database(fs.readFileSync(abs)) : new SQL.Database();
  let timer = null;
  const writeNow = () => { fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs + '.tmp', Buffer.from(db.export())); fs.renameSync(abs + '.tmp', abs); };
  const save = () => { if (mem) return; clearTimeout(timer); timer = setTimeout(writeNow, 50); };
  const allSync = (sql, params = []) => {
    const st = db.prepare(sql); st.bind(params); const rows = [];
    while (st.step()) rows.push(st.getAsObject());
    st.free(); return rows;
  };
  const runSync = (sql, params = []) => {
    db.run(sql, params);
    const id = allSync('SELECT last_insert_rowid() AS id')[0].id;
    return { id, changes: db.getRowsModified() };
  };
  return {
    kind: mem ? 'sqljs-memory' : 'sqljs-file',
    async exec(sql) { db.exec(sql); save(); },
    async all(sql, params) { return allSync(sql, params); },
    async get(sql, params) { return allSync(sql, params)[0]; },
    async run(sql, params) { const r = runSync(sql, params); save(); return r; },
    async batch(stmts) {
      db.exec('BEGIN');
      try { for (const [sql, params] of stmts) db.run(sql, params || []); db.exec('COMMIT'); }
      catch (e) { db.exec('ROLLBACK'); throw e; }
      save();
    },
    async flush() { if (!mem) { clearTimeout(timer); writeNow(); } },
    async close() { await this.flush(); db.close(); },
  };
}

// ---------- Turso / libSQL ----------
async function openLibsql(url, authToken) {
  const { createClient } = require('@libsql/client');
  const client = createClient({ url, authToken, intMode: 'number' });
  const toObjects = r => r.rows.map(row => Object.fromEntries(r.columns.map((c, i) => [c, row[i]])));
  return {
    kind: url.startsWith('file:') ? 'libsql-file' : 'libsql-remote',
    async exec(sql) { await client.executeMultiple(sql); },
    async all(sql, params = []) { return toObjects(await client.execute({ sql, args: params })); },
    async get(sql, params = []) { return toObjects(await client.execute({ sql, args: params }))[0]; },
    async run(sql, params = []) {
      const r = await client.execute({ sql, args: params });
      return { id: r.lastInsertRowid != null ? Number(r.lastInsertRowid) : undefined, changes: r.rowsAffected };
    },
    async batch(stmts) {
      // chunk to keep request bodies reasonable on remote Turso
      for (let i = 0; i < stmts.length; i += 200) {
        await client.batch(stmts.slice(i, i + 200).map(([sql, params]) => ({ sql, args: params || [] })), 'write');
      }
    },
    async flush() {},
    async close() { client.close(); },
  };
}

async function openDb(opts = {}) {
  const tursoUrl = opts.tursoUrl !== undefined ? opts.tursoUrl : process.env.TURSO_DATABASE_URL;
  const tursoToken = opts.tursoToken !== undefined ? opts.tursoToken : process.env.TURSO_AUTH_TOKEN;
  const db = tursoUrl ? await openLibsql(tursoUrl, tursoToken) : await openSqlJs(opts.file || 'data/rtc.sqlite');
  db.schemaVersion = await migrate(db);
  return db;
}

module.exports = { openDb, MIGRATIONS };
