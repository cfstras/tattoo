// State-format compatibility tests.
//
// Share links and localStorage entries created by ANY released version of
// the app must keep loading in every future version. The fixtures below
// are frozen captures of those formats — do NOT regenerate them with
// current app code when they fail. A failure here means the loader broke
// backward compatibility; fix the loader (or add a migration), never the
// fixture.
//
// Format history:
//  - localStorage 'node-drawing-positions-v1' (since edde8af):
//    JSON array of [x, y] pairs, full float precision, 100 nodes.
//  - URL hash (since 755180b): base64 of the same JSON array,
//    coordinates rounded to 1 decimal, 10-200 nodes.

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const APP_URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
const STORAGE_KEY = 'node-drawing-positions-v1';

// Frozen fixture 1: original localStorage format — exactly 100 nodes,
// unrounded float coordinates, as written by the first auto-save release.
const LEGACY_STORAGE_POSITIONS = [];
for (let i = 0; i < 100; i++) {
  LEGACY_STORAGE_POSITIONS.push([100 + i * 9.87654321, 50 + i * 3.14159265]);
}
const LEGACY_STORAGE_JSON = JSON.stringify(LEGACY_STORAGE_POSITIONS);

// Frozen fixture 2: a share-link hash captured from the first share-button
// release (base64 of JSON positions, 10 nodes at [10,10]..[100,100]).
const LEGACY_HASH =
  'W1sxMCwxMF0sWzIwLDIwXSxbMzAsMzBdLFs0MCw0MF0sWzUwLDUwXSxbNjAsNjBdLFs3MCw3MF0sWzgwLDgwXSxbOTAsOTBdLFsxMDAsMTAwXV0=';
const LEGACY_HASH_POSITIONS = [
  [10, 10], [20, 20], [30, 30], [40, 40], [50, 50],
  [60, 60], [70, 70], [80, 80], [90, 90], [100, 100],
];

let failures = 0;
function check(name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ' ' + detail : ''}`);
  if (!ok) failures++;
}

(async () => {
  const executablePath =
    process.env.CHROMIUM_PATH ||
    (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const page = await context.newPage();

  const readState = () => page.evaluate(() => ({
    count: document.querySelectorAll('.node').length,
    transforms: [...document.querySelectorAll('.node')].map(g =>
      g.getAttribute('transform')),
  }));
  const expectTransform = p => `translate(${p[0]}, ${p[1]})`;

  // --- Legacy localStorage format loads with exact positions ---
  await page.goto(APP_URL);
  await page.evaluate(([key, json]) => {
    localStorage.clear();
    localStorage.setItem(key, json);
  }, [STORAGE_KEY, LEGACY_STORAGE_JSON]);
  await page.goto(APP_URL); // plain reload, no hash
  let state = await readState();
  check('legacy localStorage: 100 nodes load', state.count === 100,
    `(got ${state.count})`);
  check('legacy localStorage: full-precision positions applied',
    state.transforms[0] === expectTransform(LEGACY_STORAGE_POSITIONS[0]) &&
    state.transforms[42] === expectTransform(LEGACY_STORAGE_POSITIONS[42]) &&
    state.transforms[99] === expectTransform(LEGACY_STORAGE_POSITIONS[99]));

  // --- Legacy share-link hash loads with exact positions ---
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${APP_URL}#${LEGACY_HASH}`);
  await page.reload();
  state = await readState();
  check('legacy hash: 10 nodes load', state.count === 10, `(got ${state.count})`);
  check('legacy hash: positions applied',
    LEGACY_HASH_POSITIONS.every((p, i) => state.transforms[i] === expectTransform(p)));

  // --- Hash takes priority over stored state ---
  await page.evaluate(([key, json]) => {
    localStorage.setItem(key, json);
  }, [STORAGE_KEY, LEGACY_STORAGE_JSON]);
  await page.goto(`${APP_URL}#${LEGACY_HASH}`);
  await page.reload();
  state = await readState();
  check('hash beats localStorage', state.count === 10, `(got ${state.count})`);

  // --- Invalid old data falls back to the default circle, no crash ---
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  for (const bad of ['not json', '[[1,2]]', '[]', '{"n":5}', JSON.stringify([['a', 'b']])]) {
    await page.evaluate(([key, json]) => {
      localStorage.clear();
      localStorage.setItem(key, json);
    }, [STORAGE_KEY, bad]);
    await page.goto(APP_URL);
    state = await readState();
    if (state.count !== 100) {
      check(`invalid stored state ${JSON.stringify(bad)} falls back to default`, false,
        `(got ${state.count} nodes)`);
    }
  }
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${APP_URL}#definitely-not-base64!!!`);
  await page.reload();
  state = await readState();
  check('invalid data falls back to default circle', state.count === 100,
    `(got ${state.count})`);
  check('no page errors on invalid data', errors.length === 0,
    errors.length ? `(${errors[0]})` : '');

  // --- Round-trip guard: what the CURRENT app saves/shares must itself
  //     satisfy the legacy contract (array of finite [x,y] pairs) ---
  await page.evaluate(() => localStorage.clear());
  await page.goto(APP_URL);
  const box = await page.locator('.node[data-index="0"] .hit').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(600, 450, { steps: 5 });
  await page.mouse.up();
  const savedNow = await page.evaluate(k => localStorage.getItem(k), STORAGE_KEY);
  let savedOk = false;
  try {
    const arr = JSON.parse(savedNow);
    savedOk = Array.isArray(arr) && arr.length === 100 &&
      arr.every(p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
  } catch (e) { /* savedOk stays false */ }
  check('current save format still matches the documented contract', savedOk);

  await page.click('#share');
  const hashNow = await page.evaluate(() => location.hash.slice(1));
  let hashOk = false;
  try {
    const arr = JSON.parse(Buffer.from(hashNow, 'base64').toString());
    hashOk = Array.isArray(arr) && arr.length === 100 &&
      arr.every(p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
  } catch (e) { /* hashOk stays false */ }
  check('current share format still matches the documented contract', hashOk);

  await browser.close();

  if (failures > 0) {
    console.error(`\n${failures} compatibility check(s) failed`);
    process.exit(1);
  }
  console.log('\nAll compatibility checks passed');
})().catch(e => { console.error(e); process.exit(1); });
