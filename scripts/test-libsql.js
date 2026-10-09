// Runs the API test suite against the libSQL backend (@libsql/client, same driver used for Turso) using a local file: URL.
const { spawnSync } = require('child_process');
const fs = require('fs'); const os = require('os'); const path = require('path');
const file = path.join(os.tmpdir(), `rtc-libsql-${Date.now()}.db`);
const r = spawnSync(process.execPath, ['--test', 'test/api.test.js'], { stdio: 'inherit', env: { ...process.env, TEST_TURSO_URL: 'file:' + file } });
for (const f of [file, file + '-wal', file + '-shm']) fs.rmSync(f, { force: true });
process.exit(r.status);
