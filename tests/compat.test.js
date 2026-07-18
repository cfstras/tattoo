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
//  - URL hash v1 (since 755180b): base64 of the same JSON array,
//    coordinates rounded to 1 decimal, 10-200 nodes.
//  - URL hash v2 (layers feature): base64 of {p: positions, l: layers}
//    where layers is 1-5 of {type, color}. Bare-array v1 hashes must
//    keep decoding. localStorage 'node-drawing-layers-v1' holds the
//    layers array separately; the positions key keeps the v1 format.
//  - URL hash v3 (binary): an un-encoded version digit '3', then
//    base64url binary: [node count u8][layer count u8][per layer:
//    type index high nibble | color index low nibble][per node: x, y
//    little-endian i16 fixed-point (value * 10)]. v1/v2 hashes never
//    start with a digit and must keep decoding. Type/color index
//    orders are frozen append-only lists in index.html.
//  - URL hash v4 (compressed): digit '4', then base64url of
//    deflate-raw over the v3 body layout with coordinates stored as
//    successive int16 deltas (first absolute, wrapping mod 2^16).
//    The encoder emits whichever of v3/v4 is shorter.
//  - v3/v4 byte 1: low 7 bits = layer count; bit 7 = close-the-loop
//    flag (connect each chain's last member back to its first).
//    Old links carry 0 there, which decodes as "open" — unchanged.

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

// Frozen fixture 3: a v2 share-link hash (base64 JSON {p, l}) captured
// from the layers release — 12 nodes on a diagonal, two custom layers.
const LEGACY_V2_HASH =
  'eyJwIjpbWzE1LDg4NV0sWzMwLDg3MF0sWzQ1LDg1NV0sWzYwLDg0MF0sWzc1LDgyNV0sWzkwLDgxMF0sWzEwNSw3OTVdLFsxMjAsNzgwXSxbMTM1LDc2NV0sWzE1MCw3NTBdLFsxNjUsNzM1XSxbMTgwLDcyMF1dLCJsIjpbeyJ0eXBlIjoib2RkIiwiY29sb3IiOiJ0ZWFsIn0seyJ0eXBlIjoibXVsdDQiLCJjb2xvciI6Im9yYW5nZSJ9XX0=';
const LEGACY_V2_FIRST_POSITION = [15, 885];
const LEGACY_V2_LAYER_STROKES = { 0: '#0d9488' /* teal */, 1: '#ea580c' /* orange */ };

// Frozen fixtures 4+5: v3 (raw binary) and v4 (delta + deflate-raw)
// hashes for the same state — 10 nodes at [10,10]..[100,100], one
// all-nodes/black layer.
const LEGACY_V3_HASH =
  '3CgEAZABkAMgAyAAsASwBkAGQAfQB9AFYAlgCvAK8AiADIAOEA4QD6APoAw';
const LEGACY_V4_HASH = '442JkSCESAgA';
const BINARY_FIXTURE_POSITIONS = [
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

  // --- Legacy v2 share-link hash loads positions AND layers ---
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${APP_URL}#${LEGACY_V2_HASH}`);
  await page.reload();
  state = await readState();
  const v2layers = await page.evaluate(() => {
    const layers = {};
    for (const line of document.querySelectorAll('.edge')) {
      const li = line.getAttribute('data-layer');
      layers[li] = line.getAttribute('stroke');
    }
    return layers;
  });
  check('legacy v2 hash: 12 nodes load', state.count === 12, `(got ${state.count})`);
  check('legacy v2 hash: positions applied',
    state.transforms[0] === expectTransform(LEGACY_V2_FIRST_POSITION));
  check('legacy v2 hash: layers applied (odd/teal, mult4/orange)',
    v2layers['0'] === LEGACY_V2_LAYER_STROKES[0] &&
    v2layers['1'] === LEGACY_V2_LAYER_STROKES[1],
    JSON.stringify(v2layers));

  // --- v3 and v4 binary hashes load identically ---
  for (const [name, fixture] of [['v3', LEGACY_V3_HASH], ['v4', LEGACY_V4_HASH]]) {
    await page.evaluate(() => localStorage.clear());
    await page.goto(`${APP_URL}#${fixture}`);
    await page.reload();
    state = await readState();
    check(`${name} hash: 10 nodes load`, state.count === 10, `(got ${state.count})`);
    check(`${name} hash: positions applied`,
      BINARY_FIXTURE_POSITIONS.every((p, i) => state.transforms[i] === expectTransform(p)));
  }

  // --- A hash differing from stored state prompts, and Load applies it ---
  await page.evaluate(([key, json]) => {
    localStorage.setItem(key, json);
  }, [STORAGE_KEY, LEGACY_STORAGE_JSON]);
  await page.goto(`${APP_URL}#${LEGACY_HASH}`);
  await page.reload();
  const prompted = await page.evaluate(() => document.getElementById('confirm-load').open);
  check('differing hash prompts before replacing saved state', prompted);
  await page.click('#load-link');
  state = await readState();
  check('confirmed load applies the hash state', state.count === 10, `(got ${state.count})`);

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
  await page.waitForFunction(() => location.hash.length > 1); // share encodes async
  const hashNow = await page.evaluate(() => location.hash.slice(1));
  let hashOk = false;
  try {
    // v3/v4 contract, decoded here independently of the app code
    const version = hashNow[0];
    if (version === '3' || version === '4') {
      const b64 = hashNow.slice(1).replace(/-/g, '+').replace(/_/g, '/');
      let buf = Buffer.from(b64, 'base64');
      if (version === '4') buf = require('zlib').inflateRawSync(buf);
      const n = buf.readUInt8(0);
      const lc = buf.readUInt8(1) & 0x7f; // bit 7 is the close-the-loop flag
      let x0 = buf.readInt16LE(2 + lc);
      let y0 = buf.readInt16LE(2 + lc + 2);
      // v4 deltas: the first pair is absolute, so no summing needed for node 1
      hashOk = n === 100 && lc >= 1 && lc <= 5 &&
        buf.length === 2 + lc + 4 * n &&
        Math.abs(x0 / 10 - 600) < 1 && Math.abs(y0 / 10 - 450) < 1; // the dragged node
    }
  } catch (e) { /* hashOk stays false */ }
  check('current share format still matches the documented contract', hashOk,
    `(version ${hashNow[0]}, ${hashNow.length} chars)`);

  await browser.close();

  if (failures > 0) {
    console.error(`\n${failures} compatibility check(s) failed`);
    process.exit(1);
  }
  console.log('\nAll compatibility checks passed');
})().catch(e => { console.error(e); process.exit(1); });
