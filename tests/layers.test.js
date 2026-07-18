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

  const layerInfo = () => page.evaluate(() => {
    const layers = {};
    for (const line of document.querySelectorAll('.edge')) {
      const li = line.getAttribute('data-layer');
      layers[li] = layers[li] || { count: 0, stroke: line.getAttribute('stroke') };
      layers[li].count++;
    }
    return layers;
  });
  const nodePos = () => page.evaluate(() =>
    document.querySelector('.node[data-index="0"]').getAttribute('transform'));

  // --- Defaults: all/black, even/red, primes/blue ---
  let info = await layerInfo();
  console.log('default layer 0 = all nodes, black:',
    info['0'] && info['0'].count === 99 && info['0'].stroke === '#000000' ? 'PASS' : 'FAIL',
    JSON.stringify(info['0']));
  console.log('default layer 1 = even numbers, red:',
    info['1'] && info['1'].count === 49 && info['1'].stroke === '#dc2626' ? 'PASS' : 'FAIL',
    JSON.stringify(info['1']));
  // 25 primes up to 100 -> 24 edges
  console.log('default layer 2 = prime numbers, blue:',
    info['2'] && info['2'].count === 24 && info['2'].stroke === '#2563eb' ? 'PASS' : 'FAIL',
    JSON.stringify(info['2']));

  // Prime chain endpoints: first edge 2-3, last edge 89-97
  const primeEdges = await page.evaluate(() => {
    const lines = [...document.querySelectorAll('[data-layer="2"]')];
    const nodeAt = (x, y) => [...document.querySelectorAll('.node')].find(g =>
      g.getAttribute('transform') === `translate(${x}, ${y})`);
    const first = lines[0], last = lines[lines.length - 1];
    return {
      first: [
        +nodeAt(first.getAttribute('x1'), first.getAttribute('y1')).dataset.index + 1,
        +nodeAt(first.getAttribute('x2'), first.getAttribute('y2')).dataset.index + 1,
      ],
      last: [
        +nodeAt(last.getAttribute('x1'), last.getAttribute('y1')).dataset.index + 1,
        +nodeAt(last.getAttribute('x2'), last.getAttribute('y2')).dataset.index + 1,
      ],
    };
  });
  console.log('prime chain runs 2-3 ... 89-97:',
    primeEdges.first[0] === 2 && primeEdges.first[1] === 3 &&
    primeEdges.last[0] === 89 && primeEdges.last[1] === 97 ? 'PASS' : 'FAIL',
    JSON.stringify(primeEdges));

  // --- Add a fourth layer (multiples of 3), apply without reset ---
  const posBefore = await nodePos();
  await page.click('#settings-btn');
  await page.click('#add-layer');
  await page.evaluate(() => {
    const rows = document.querySelectorAll('.layer-row');
    const row = rows[rows.length - 1];
    const type = row.querySelector('.layer-type');
    type.value = 'mult3';
    type.dispatchEvent(new Event('change', { bubbles: true }));
    const color = row.querySelector('.layer-color');
    color.value = 'green';
    color.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.click('#apply-settings');
  const warningShown = await page.evaluate(() => document.getElementById('confirm-reset').open);
  console.log('layer-only change skips reset warning:', !warningShown ? 'PASS' : 'FAIL');
  info = await layerInfo();
  // multiples of 3 up to 100: 33 members -> 32 edges
  console.log('new layer: multiples of 3 in green (32 edges):',
    info['3'] && info['3'].count === 32 && info['3'].stroke === '#16a34a' ? 'PASS' : 'FAIL',
    JSON.stringify(info['3']));
  console.log('layer change keeps node positions:', (await nodePos()) === posBefore ? 'PASS' : 'FAIL');

  // --- Change a layer color ---
  await page.click('#settings-btn');
  await page.evaluate(() => {
    const color = document.querySelectorAll('.layer-row')[0].querySelector('.layer-color');
    color.value = 'purple';
    color.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.click('#apply-settings');
  info = await layerInfo();
  console.log('layer 0 recolored to purple:', info['0'].stroke === '#7c3aed' ? 'PASS' : 'FAIL');

  // --- Layers persist across reload ---
  await page.reload();
  info = await layerInfo();
  console.log('layers persist after reload:',
    Object.keys(info).length === 4 && info['0'].stroke === '#7c3aed' &&
    info['3'] && info['3'].stroke === '#16a34a' ? 'PASS' : 'FAIL');

  // --- Share link carries layers to a fresh browser context ---
  await page.click('#share');
  await page.waitForFunction(() => location.hash.length > 1);
  const url = await page.evaluate(() => location.href);
  const context2 = await browser.newContext();
  const page2 = await context2.newPage();
  await page2.goto(url);
  const info2 = await page2.evaluate(() => {
    const layers = {};
    for (const line of document.querySelectorAll('.edge')) {
      const li = line.getAttribute('data-layer');
      layers[li] = layers[li] || { count: 0, stroke: line.getAttribute('stroke') };
      layers[li].count++;
    }
    return layers;
  });
  console.log('share link carries layers:',
    Object.keys(info2).length === 4 && info2['0'].stroke === '#7c3aed' &&
    info2['3'] && info2['3'].count === 32 ? 'PASS' : 'FAIL');
  await context2.close();

  // --- Remove a layer ---
  await page.click('#settings-btn');
  await page.evaluate(() => {
    document.querySelectorAll('.layer-row')[3].querySelector('.layer-remove').click();
  });
  await page.click('#apply-settings');
  info = await layerInfo();
  console.log('layer removed:', Object.keys(info).length === 3 ? 'PASS' : 'FAIL');

  // --- Cap at 5 layers, floor at 1 ---
  await page.click('#settings-btn');
  await page.click('#add-layer');
  await page.click('#add-layer');
  const state = await page.evaluate(() => ({
    rows: document.querySelectorAll('.layer-row').length,
    addDisabled: document.getElementById('add-layer').disabled,
  }));
  console.log('add capped at 5 layers:', state.rows === 5 && state.addDisabled ? 'PASS' : 'FAIL');
  await page.evaluate(() => {
    for (let i = 0; i < 4; i++) {
      document.querySelector('.layer-row .layer-remove').click();
    }
  });
  const lastRemoveDisabled = await page.evaluate(() =>
    document.querySelector('.layer-row .layer-remove').disabled);
  console.log('last layer cannot be removed:', lastRemoveDisabled ? 'PASS' : 'FAIL');
  await page.click('#cancel-settings');

  // --- Cancel discards layer edits ---
  await page.click('#settings-btn');
  const rowsAfterCancel = await page.evaluate(() =>
    document.querySelectorAll('.layer-row').length);
  console.log('cancel discarded layer edits:', rowsAfterCancel === 3 ? 'PASS' : 'FAIL');

  await browser.close();
})();
