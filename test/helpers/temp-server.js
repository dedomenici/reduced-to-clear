// Starts the real server on a spare port with a COPY of the database, so browser tests never touch real data.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
module.exports = async function tempServer({ port = 3900 + Math.floor(Math.random() * 90), env = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtc-test-'));
  const db = path.join(dir, 'rtc.sqlite');
  const src = path.join(ROOT, 'data', 'rtc.sqlite');
  if (fs.existsSync(src)) fs.copyFileSync(src, db);
  const up = path.join(ROOT, 'uploads');
  const before = new Set(fs.readdirSync(up));
  const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, TURSO_DATABASE_URL: '', TURSO_AUTH_TOKEN: '', PORT: String(port), DB_FILE: db, OSM_ON_DEMAND: env.OVERPASS_URLS ? 'true' : 'false', ...env }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('server did not start')), 15000);
    child.stdout.on('data', d => { if (String(d).includes('running')) { clearTimeout(t); res(); } });
    child.on('exit', c => rej(new Error('server exited ' + c)));
  });
  return {
    base: `http://localhost:${port}`,
    stop() {
      child.kill();
      fs.rmSync(dir, { recursive: true, force: true });
      for (const f of fs.readdirSync(up)) if (!before.has(f)) fs.unlinkSync(path.join(up, f)); // photos uploaded during this run
    },
  };
};
