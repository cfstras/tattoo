const { chromium } = require('playwright');
const fs = require('fs');

const APP = 'file://' + require('path').resolve(__dirname, '..', 'index.html');

(async () => {
  const browser = await chromium.launch(process.env.CHROMIUM_PATH || require('fs').existsSync('/opt/pw-browsers/chromium')
  ? { executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' } : {});
  const context = await browser.newContext({
    viewport: { width: 1200, height: 900 },
    acceptDownloads: true,
  });
  const page = await context.newPage();
  await page.goto(APP);
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  // --- Approximate warning modal ---
  await page.click('#settings-btn');
  await page.click('#approximate');
  let state = await page.evaluate(() => ({
    warning: document.getElementById('confirm-approx').open,
    settings: document.getElementById('settings').open,
    bar: !document.getElementById('approx-bar').hidden,
  }));
  console.log('approximate shows warning, settings stays open, no run yet:',
    state.warning && state.settings && !state.bar ? 'PASS' : 'FAIL', JSON.stringify(state));
  await page.click('#cancel-approx');
  state = await page.evaluate(() => ({
    warning: document.getElementById('confirm-approx').open,
    settings: document.getElementById('settings').open,
    bar: !document.getElementById('approx-bar').hidden,
  }));
  console.log('cancel returns to settings without starting:',
    !state.warning && state.settings && !state.bar ? 'PASS' : 'FAIL', JSON.stringify(state));
  await page.click('#approximate');
  await page.click('#do-approx');
  state = await page.evaluate(() => ({
    warning: document.getElementById('confirm-approx').open,
    settings: document.getElementById('settings').open,
    bar: !document.getElementById('approx-bar').hidden,
  }));
  console.log('confirm closes both dialogs and starts the run:',
    !state.warning && !state.settings && state.bar ? 'PASS' : 'FAIL', JSON.stringify(state));
  await page.click('#reset');
  await page.click('#do-reset'); // cancel the run for the rest of the test

  // --- Outlines debug view ---
  await page.click('#debug-btn');
  let dbg = await page.evaluate(() => {
    const g = document.querySelector('.debug-outlines');
    return g && {
      polys: g.querySelectorAll('polygon').length,
      strokes: [...g.querySelectorAll('polygon')].map(p => p.getAttribute('stroke')),
      active: document.getElementById('debug-btn').classList.contains('active'),
    };
  });
  console.log('outlines button draws dashed layer contours:',
    dbg && dbg.polys === 2 && dbg.active &&
    dbg.strokes[0] === '#000000' && dbg.strokes[1] === '#dc2626' ? 'PASS' : 'FAIL',
    JSON.stringify(dbg));
  await page.click('#debug-btn');
  dbg = await page.evaluate(() => ({
    gone: !document.querySelector('.debug-outlines'),
    active: document.getElementById('debug-btn').classList.contains('active'),
  }));
  console.log('outlines button toggles off:', dbg.gone && !dbg.active ? 'PASS' : 'FAIL');

  // --- Hide nodes ---
  await page.click('#toggle-nodes');
  let vis = await page.evaluate(() => ({
    display: getComputedStyle(document.getElementById('nodes')).display,
    label: document.getElementById('toggle-nodes').textContent,
    edges: getComputedStyle(document.getElementById('edges')).display,
  }));
  console.log('hide nodes shows edges only:',
    vis.display === 'none' && vis.edges !== 'none' && vis.label === 'Show nodes'
      ? 'PASS' : 'FAIL', JSON.stringify(vis));
  await page.click('#toggle-nodes');
  vis = await page.evaluate(() => ({
    display: getComputedStyle(document.getElementById('nodes')).display,
    label: document.getElementById('toggle-nodes').textContent,
  }));
  console.log('show nodes restores them:',
    vis.display !== 'none' && vis.label === 'Hide nodes' ? 'PASS' : 'FAIL');

  // --- Plain numbers node style ---
  await page.click('#settings-btn');
  await page.selectOption('#node-style', 'number');
  await page.click('#apply-settings');
  let dot = await page.evaluate(() => {
    const el = document.querySelector('.dot');
    const cs = getComputedStyle(el);
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    return { fill: cs.fill, stroke: cs.stroke, bg, r: el.getAttribute('r') };
  });
  console.log('plain style: background halo, no ring, margin kept:',
    dot.stroke === 'none' && dot.r === '11' &&
    dot.fill.replace(/\s/g, '') === 'rgb(242,243,247)' ? 'PASS' : 'FAIL', JSON.stringify(dot));

  // persists across reload
  await page.reload();
  dot = await page.evaluate(() => {
    const cs = getComputedStyle(document.querySelector('.dot'));
    return { stroke: cs.stroke, sel: undefined };
  });
  console.log('plain style persists after reload:', dot.stroke === 'none' ? 'PASS' : 'FAIL');

  // svg export carries the style
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#download'),
  ]);
  const svgText = fs.readFileSync(await download.path(), 'utf8');
  console.log('svg export uses plain style:',
    svgText.includes('.dot{fill:#f2f3f7;stroke:none}') ? 'PASS' : 'FAIL');

  // back to circles
  await page.click('#settings-btn');
  await page.selectOption('#node-style', 'circle');
  await page.click('#apply-settings');
  dot = await page.evaluate(() =>
    getComputedStyle(document.querySelector('.dot')).stroke);
  console.log('circle style restores the ring:', dot !== 'none' ? 'PASS' : 'FAIL');

  // --- Paint order: edges < halos < labels; outlines front at 50% ---
  const order = await page.evaluate(() => {
    const svg = document.getElementById('canvas');
    const kids = [...svg.children].map(el => el.id || el.className.baseVal);
    return {
      layers: kids.slice(0, 3),
      dotsBeforeLabels: !!(document.getElementById('halos').compareDocumentPosition(
        document.getElementById('nodes')) & Node.DOCUMENT_POSITION_FOLLOWING),
    };
  });
  console.log('halos paint above edges and below all labels:',
    JSON.stringify(order.layers) === '["edges","halos","nodes"]' &&
    order.dotsBeforeLabels ? 'PASS' : 'FAIL', JSON.stringify(order.layers));

  await page.click('#debug-btn');
  const dbgFront = await page.evaluate(() => {
    const svg = document.getElementById('canvas');
    const overlay = document.querySelector('.debug-outlines');
    return {
      last: svg.lastElementChild === overlay,
      opacity: getComputedStyle(overlay).opacity,
    };
  });
  console.log('outlines overlay is frontmost at 50% opacity:',
    dbgFront.last && dbgFront.opacity === '0.5' ? 'PASS' : 'FAIL', JSON.stringify(dbgFront));
  await page.click('#debug-btn');

  // dragging still works with split layers, and raises both parts
  const box = await page.locator('.node[data-index="0"] .hit').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(600, 450, { steps: 5 });
  await page.mouse.up();
  const dragged = await page.evaluate(() => {
    const g = document.querySelector('.node[data-index="0"]');
    const dot = document.querySelector('#halos .dot:last-child');
    return {
      transform: g.getAttribute('transform'),
      dotAt: [dot.getAttribute('cx'), dot.getAttribute('cy')],
    };
  });
  console.log('drag moves label group and halo together:',
    dragged.transform === 'translate(600, 450)' &&
    dragged.dotAt[0] === '600' && dragged.dotAt[1] === '450' ? 'PASS' : 'FAIL',
    JSON.stringify(dragged));

  await browser.close();
})();
