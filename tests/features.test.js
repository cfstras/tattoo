const { chromium } = require('playwright');
const APP = 'file://' + require('path').resolve(__dirname, '..', 'index.html');

const fs = require('fs');

(async () => {
  const browser = await chromium.launch(process.env.CHROMIUM_PATH || require('fs').existsSync('/opt/pw-browsers/chromium')
  ? { executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' } : {});
  const context = await browser.newContext({
    viewport: { width: 1200, height: 900 },
    acceptDownloads: true,
  });
  const page = await context.newPage();
  await page.goto(APP);

  const counts = () => page.evaluate(() => ({
    nodes: document.querySelectorAll('.node').length,
    seq: document.querySelectorAll('[data-layer="0"]').length,
    even: document.querySelectorAll('[data-layer="1"]').length,
  }));
  const nodePos = () => page.evaluate(() =>
    document.querySelector('.node[data-index="0"]').getAttribute('transform'));

  // --- Share: drag, click share, hash decodes to the current positions ---
  const box = await page.locator('.node[data-index="0"] .hit').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(600, 450, { steps: 10 });
  await page.mouse.up();
  const dragged = await nodePos();

  // drag alone updates the URL hash (debounced ~500ms)
  let autoHash = '';
  for (let i = 0; i < 20 && !autoHash; i++) {
    await new Promise(r => setTimeout(r, 200));
    autoHash = await page.evaluate(() => location.hash.slice(1));
  }
  console.log('drag auto-updates URL hash:', autoHash.length > 0 ? 'PASS' : 'FAIL');

  await page.click('#share');
  await page.waitForFunction(() => location.hash.length > 1);
  const hash = await page.evaluate(() => location.hash.slice(1));
  console.log('share sets hash:', hash.length > 0 ? 'PASS' : 'FAIL');
  console.log('hash starts with version digit 3 or 4:',
    hash[0] === '3' || hash[0] === '4' ? 'PASS' : 'FAIL', `(v${hash[0]}, ${hash.length} chars)`);
  const decodeBinary = h => {
    let buf = Buffer.from(h.slice(1).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    if (h[0] === '4') buf = require('zlib').inflateRawSync(buf);
    const n = buf.readUInt8(0), lc = buf.readUInt8(1);
    const p = [];
    let px = 0, py = 0;
    for (let i = 0; i < n; i++) {
      const o = 2 + lc + i * 4;
      let x = buf.readInt16LE(o), y = buf.readInt16LE(o + 2);
      if (h[0] === '4') { x = (px + x << 16) >> 16; y = (py + y << 16) >> 16; px = x; py = y; }
      p.push([x / 10, y / 10]);
    }
    return p;
  };
  const decoded = decodeBinary(hash);
  console.log('hash is base64 of 100 positions:', decoded.length === 100 ? 'PASS' : 'FAIL');
  console.log('hash holds dragged position:',
    Math.round(decoded[0][0]) === 600 && Math.round(decoded[0][1]) === 450 ? 'PASS' : 'FAIL');

  // Opening the share link in a fresh page (no localStorage) restores the layout
  const page2 = await context.newPage();
  await page2.goto(APP);
  await page2.evaluate(() => localStorage.clear());
  await page2.goto(`${APP}#${hash}`);
  await page2.reload();
  const restored = await page2.evaluate(() =>
    document.querySelector('.node[data-index="0"]').getAttribute('transform'));
  console.log('share link restores layout:', restored === dragged ? 'PASS' : 'FAIL');
  await page2.close();

  // --- Download SVG ---
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#download'),
  ]);
  console.log('download filename:', download.suggestedFilename() === 'node-drawing.svg' ? 'PASS' : 'FAIL');
  const path = await download.path();
  const svgText = fs.readFileSync(path, 'utf8');
  const circles = (svgText.match(/<circle/g) || []).length;
  const lines = (svgText.match(/<line/g) || []).length;
  console.log('svg has 200 circles (hit+dot per node):', circles === 200 ? 'PASS' : 'FAIL');
  console.log('svg has 172 lines (99 all + 49 even + 24 prime):', lines === 172 ? 'PASS' : 'FAIL');
  console.log('svg carries inline styles:', svgText.includes('.edge{stroke-width:1.5}') ? 'PASS' : 'FAIL');

  const setSlider = v => page.evaluate(val => {
    const el = document.getElementById('node-count');
    el.value = val;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, v);

  // --- Settings: change count -> warning modal -> confirm applies ---
  await page.click('#settings-btn');
  const settingsOpen = await page.evaluate(() => document.getElementById('settings').open);
  console.log('settings dialog opens:', settingsOpen ? 'PASS' : 'FAIL');
  await setSlider('20');
  const readout = await page.evaluate(() => document.getElementById('node-count-value').textContent);
  console.log('slider readout updates:', readout === '20' ? 'PASS' : 'FAIL');
  await page.click('#apply-settings');
  const warningShown = await page.evaluate(() => document.getElementById('confirm-reset').open);
  console.log('apply shows reset warning:', warningShown ? 'PASS' : 'FAIL');
  await page.click('#do-reset');
  let c = await counts();
  console.log('confirm rebuilds with 20 nodes:',
    c.nodes === 20 && c.seq === 19 && c.even === 9 ? 'PASS' : 'FAIL', JSON.stringify(c));
  let resetDecoded = [];
  for (let i = 0; i < 20 && resetDecoded.length !== 20; i++) {
    await new Promise(r => setTimeout(r, 200));
    const h = await page.evaluate(() => location.hash.slice(1));
    try { resetDecoded = decodeBinary(h); } catch (e) { /* not updated yet */ }
  }
  console.log('reset updates URL hash to the new state:',
    resetDecoded.length === 20 ? 'PASS' : 'FAIL');

  // --- Settings: cancelling the warning keeps the current count ---
  await page.click('#settings-btn');
  await setSlider('50');
  await page.click('#apply-settings');
  await page.click('#cancel-reset');
  c = await counts();
  console.log('cancel keeps 20 nodes:', c.nodes === 20 ? 'PASS' : 'FAIL');

  // --- Odd node count: even ring must not connect to an odd number ---
  await page.click('#settings-btn');
  await setSlider('15');
  await page.click('#apply-settings');
  await page.click('#do-reset');
  c = await counts();
  console.log('odd count 15 -> 6 even-chain edges:',
    c.nodes === 15 && c.seq === 14 && c.even === 6 ? 'PASS' : 'FAIL', JSON.stringify(c));

  // --- Input clamping ---
  await page.click('#settings-btn');
  await setSlider('500');
  await page.click('#apply-settings');
  await page.click('#do-reset');
  c = await counts();
  console.log('count clamped to 200:', c.nodes === 200 ? 'PASS' : 'FAIL');

  await browser.close();
})();
