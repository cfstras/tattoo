const { chromium } = require('playwright');
const APP = 'file://' + require('path').resolve(__dirname, '..', 'index.html');


(async () => {
  const browser = await chromium.launch(process.env.CHROMIUM_PATH || require('fs').existsSync('/opt/pw-browsers/chromium')
  ? { executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' } : {});
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await page.goto(APP);

  const counts = await page.evaluate(() => ({
    nodes: document.querySelectorAll('.node').length,
    seq: document.querySelectorAll('[data-layer="0"]').length,
    even: document.querySelectorAll('[data-layer="1"]').length,
  }));
  console.log('counts:', JSON.stringify(counts));

  // Node "1" position and its connected edge endpoints before drag
  const before = await page.evaluate(() => {
    const g = document.querySelector('.node[data-index="0"]');
    const t = g.getAttribute('transform');
    const line = document.querySelectorAll('[data-layer="0"]')[0]; // edge 1-2
    return { t, x1: line.getAttribute('x1'), y1: line.getAttribute('y1') };
  });
  console.log('before:', JSON.stringify(before));


  // Drag node 1 to the center
  const box = await page.locator('.node[data-index="0"] .hit').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(600, 450, { steps: 10 });
  await page.mouse.up();

  const after = await page.evaluate(() => {
    const g = document.querySelector('.node[data-index="0"]');
    const t = g.getAttribute('transform');
    const line = document.querySelectorAll('[data-layer="0"]')[0];
    return { t, x1: line.getAttribute('x1'), y1: line.getAttribute('y1') };
  });
  console.log('after:', JSON.stringify(after));


  const countsOk = counts.seq === 99 && counts.even === 49;
  const moved = countsOk && before.t !== after.t &&
    (before.x1 !== after.x1 || before.y1 !== after.y1);
  console.log(moved ? 'PASS: node dragged and edge followed' : 'FAIL: nothing moved');

  await browser.close();
  process.exit(moved ? 0 : 1);
})();
