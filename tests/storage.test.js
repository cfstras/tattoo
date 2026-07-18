const { chromium } = require('playwright');
const APP = 'file://' + require('path').resolve(__dirname, '..', 'index.html');


(async () => {
  const browser = await chromium.launch(process.env.CHROMIUM_PATH || require('fs').existsSync('/opt/pw-browsers/chromium')
  ? { executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' } : {});
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const page = await context.newPage();
  const KEY = 'node-drawing-positions-v1';

  const nodePos = () => page.evaluate(() =>
    document.querySelector('.node[data-index="0"]').getAttribute('transform'));
  const stored = () => page.evaluate(k => localStorage.getItem(k), KEY);

  await page.goto(APP);
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  console.log('nothing stored before drag:', (await stored()) === null ? 'PASS' : 'FAIL');

  // Drag node 1 to the center
  const box = await page.locator('.node[data-index="0"] .hit').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(600, 450, { steps: 10 });

  // Still mid-drag (button down): nothing saved yet
  console.log('not saved mid-drag:', (await stored()) === null ? 'PASS' : 'FAIL');

  await page.mouse.up();
  const dragged = await nodePos();

  // Saved immediately after releasing
  const savedJson = await stored();
  console.log('saved right after drag ends:', savedJson !== null ? 'PASS' : 'FAIL');
  const saved = JSON.parse(savedJson || '[]');
  console.log('saved has 100 positions:', saved.length === 100 ? 'PASS' : 'FAIL');
  console.log('saved node 1 at drag target:',
    Math.round(saved[0][0]) === 600 && Math.round(saved[0][1]) === 450 ? 'PASS' : 'FAIL');

  // Reload: position restored from storage
  await page.reload();
  const afterReload = await nodePos();
  console.log('position restored on reload:', afterReload === dragged ? 'PASS' : 'FAIL');

  // Confirmed reset clears storage and restores the circle
  await page.click('#reset');
  await page.click('#do-reset');
  console.log('reset clears storage:', (await stored()) === null ? 'PASS' : 'FAIL');
  const afterReset = await nodePos();
  console.log('reset restores circle:', afterReset !== dragged ? 'PASS' : 'FAIL');

  await browser.close();
})();
