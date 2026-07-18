// Runs every *.test.js in this directory sequentially. A suite fails if
// it exits non-zero or prints a FAIL line. Suites are plain Node scripts
// driving the app in headless Chromium — no framework needed.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const files = fs.readdirSync(__dirname)
  .filter(f => f.endsWith('.test.js'))
  .sort();

let failed = [];
for (const f of files) {
  console.log(`\n=== ${f} ===`);
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], {
    encoding: 'utf8',
    timeout: 5 * 60 * 1000,
  });
  process.stdout.write(r.stdout || '');
  process.stderr.write(r.stderr || '');
  if (r.status !== 0 || /FAIL/.test(r.stdout || '')) failed.push(f);
}

if (failed.length) {
  console.error(`\n${failed.length} suite(s) failed: ${failed.join(', ')}`);
  process.exit(1);
}
console.log(`\nAll ${files.length} suites passed`);
