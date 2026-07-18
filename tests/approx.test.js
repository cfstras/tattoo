const { chromium } = require('playwright');

const APP = 'file://' + require('path').resolve(__dirname, '..', 'index.html');

(async () => {
  const browser = await chromium.launch(process.env.CHROMIUM_PATH || require('fs').existsSync('/opt/pw-browsers/chromium')
  ? { executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' } : {});
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const page = await context.newPage();
  await page.goto(APP);
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  const barVisible = () => page.evaluate(() =>
    !document.getElementById('approx-bar').hidden);
  const positions = () => page.evaluate(() =>
    [...document.querySelectorAll('.node')].map(g => g.getAttribute('transform')));

  // --- Start: settings close, bar appears, slow is the default speed ---
  await page.click('#settings-btn');
  const btnEnabled = await page.evaluate(() =>
    !document.getElementById('approximate').disabled);
  console.log('approximate enabled with default pictures:', btnEnabled ? 'PASS' : 'FAIL');
  await page.click('#approximate');
  await page.click('#do-approx');
  const settingsClosed = await page.evaluate(() =>
    !document.getElementById('settings').open);
  console.log('approximate closes settings:', settingsClosed ? 'PASS' : 'FAIL');
  console.log('control bar appears:', (await barVisible()) ? 'PASS' : 'FAIL');
  const slowActive = await page.evaluate(() =>
    document.querySelector('.speed[data-speed="slow"]').classList.contains('active'));
  console.log('slow speed active by default:', slowActive ? 'PASS' : 'FAIL');

  // --- Pause freezes movement, resume continues ---
  await new Promise(r => setTimeout(r, 700));
  await page.click('#approx-pause');
  const pausedLabel = await page.evaluate(() =>
    document.getElementById('approx-pause').textContent);
  console.log('pause button toggles to Resume:', pausedLabel === 'Resume' ? 'PASS' : 'FAIL');
  await new Promise(r => setTimeout(r, 300)); // let any in-flight step land
  const frozen1 = await positions();
  await new Promise(r => setTimeout(r, 700));
  const frozen2 = await positions();
  console.log('pause freezes all nodes:',
    JSON.stringify(frozen1) === JSON.stringify(frozen2) ? 'PASS' : 'FAIL');
  await page.click('#approx-pause');
  await new Promise(r => setTimeout(r, 700));
  const moving = await positions();
  console.log('resume continues movement:',
    JSON.stringify(moving) !== JSON.stringify(frozen2) ? 'PASS' : 'FAIL');

  // --- Speed switch: max becomes active and it converges quickly ---
  await page.click('.speed[data-speed="max"]');
  const maxActive = await page.evaluate(() =>
    document.querySelector('.speed[data-speed="max"]').classList.contains('active') &&
    !document.querySelector('.speed[data-speed="slow"]').classList.contains('active'));
  console.log('speed selector switches to max:', maxActive ? 'PASS' : 'FAIL');
  await page.waitForFunction(() => window.__approx && window.__approx.done,
    null, { timeout: 90000 });
  const result = await page.evaluate(() => window.__approx);
  console.log('converges (all deltas < 1px):',
    result.done && result.maxMove < 1 ? 'PASS' : 'FAIL',
    `(iter ${result.iter}, maxMove ${result.maxMove.toFixed(3)})`);
  console.log('noise decayed over enough iterations:', result.iter > 30 ? 'PASS' : 'FAIL');
  console.log('control bar hides when done:', !(await barVisible()) ? 'PASS' : 'FAIL');

  // --- Shape sanity: both pictures overlap in the same central spot ---
  const overlap = await page.evaluate(() => {
    const pos = { even: [], odd: [] };
    for (const g of document.querySelectorAll('.node')) {
      const num = +g.dataset.index + 1;
      const m = g.getAttribute('transform').match(/translate\(([-\d.]+), ([-\d.]+)\)/);
      (num % 2 === 0 ? pos.even : pos.odd).push([+m[1], +m[2]]);
    }
    const mean = a => [a.reduce((s, p) => s + p[0], 0) / a.length,
      a.reduce((s, p) => s + p[1], 0) / a.length];
    const [ex, ey] = mean(pos.even), [ox, oy] = mean(pos.odd);
    const all = pos.even.concat(pos.odd);
    return {
      centroidDist: Math.hypot(ex - ox, ey - oy),
      inBox: all.every(p => p[0] > 0 && p[0] < 1200 && p[1] > 40 && p[1] < 900),
    };
  });
  console.log('even and odd shapes overlap (close centroids):',
    overlap.centroidDist < 150 && overlap.inBox ? 'PASS' : 'FAIL',
    JSON.stringify(overlap));

  // --- Result persisted ---
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('node-drawing-positions-v1')));
  console.log('converged drawing saved to storage:',
    Array.isArray(saved) && saved.length === 100 ? 'PASS' : 'FAIL');

  // --- A second run starts fresh: visible, back at slow speed ---
  await page.click('#settings-btn');
  await page.click('#approximate');
  await page.click('#do-approx');
  await new Promise(r => setTimeout(r, 800));
  const second = await page.evaluate(() => ({
    bar: !document.getElementById('approx-bar').hidden,
    done: window.__approx.done,
    speed: document.querySelector('.speed.active').dataset.speed,
  }));
  console.log('second run restarts visibly at slow speed:',
    second.bar && !second.done && second.speed === 'slow' ? 'PASS' : 'FAIL',
    JSON.stringify(second));
  await page.click('.speed[data-speed="max"]');
  await page.waitForFunction(() => window.__approx && window.__approx.done,
    null, { timeout: 90000 });
  console.log('second run also converges:', 'PASS');

  // --- Reset cancels a running approximation ---
  await page.click('#settings-btn');
  await page.click('#approximate');
  await page.click('#do-approx');
  await new Promise(r => setTimeout(r, 300));
  await page.click('#reset');
  await page.click('#do-reset');
  console.log('reset cancels the run and hides the bar:',
    !(await barVisible()) ? 'PASS' : 'FAIL');

  // --- No pictures -> approximate disabled ---
  await page.click('#settings-btn');
  await page.evaluate(() => {
    for (const sel of document.querySelectorAll('.pic-row select')) {
      sel.value = 'none';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  const disabled = await page.evaluate(() =>
    document.getElementById('approximate').disabled);
  console.log('approximate disabled without pictures:', disabled ? 'PASS' : 'FAIL');
  await page.click('#cancel-settings');

  await browser.close();
})();
