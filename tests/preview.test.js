const { chromium } = require('playwright');

// v3 fixture: 10 nodes at [10,10]..[100,100], one all/black layer
const FIXTURE = '3CgEAZABkAMgAyAAsASwBkAGQAfQB9AFYAlgCvAK8AiADIAOEA4QD6APoAw';
const APP = 'file://' + require('path').resolve(__dirname, '..', 'index.html');

(async () => {
  const browser = await chromium.launch(process.env.CHROMIUM_PATH || require('fs').existsSync('/opt/pw-browsers/chromium')
  ? { executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' } : {});
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const page = await context.newPage();

  const dialogOpen = () => page.evaluate(() => document.getElementById('confirm-load').open);
  const nodeCount = () => page.evaluate(() => document.querySelectorAll('.node').length);
  const nodePos = () => page.evaluate(() =>
    document.querySelector('.node[data-index="0"]').getAttribute('transform'));

  // 1. No saved state: link loads directly, no prompt
  await page.goto(APP);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${APP}#${FIXTURE}`);
  await page.reload();
  console.log('no saved state -> link loads silently:',
    !(await dialogOpen()) && (await nodeCount()) === 10 ? 'PASS' : 'FAIL');

  // 2. Saved state differs from link: prompt shows, canvas still shows saved state
  await page.goto(APP);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const box = await page.locator('.node[data-index="0"] .hit').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(600, 450, { steps: 5 });
  await page.mouse.up(); // saves the 100-node state
  const savedPos = await nodePos();

  await page.goto(`${APP}#${FIXTURE}`);
  await page.reload();
  console.log('differing link -> prompt shown:', (await dialogOpen()) ? 'PASS' : 'FAIL');
  console.log('canvas still shows the saved drawing:',
    (await nodeCount()) === 100 && (await nodePos()) === savedPos ? 'PASS' : 'FAIL');
  const preview = await page.evaluate(() => {
    const svg = document.querySelector('#link-preview svg');
    return svg && {
      lines: svg.querySelectorAll('line').length,
      circles: svg.querySelectorAll('circle').length,
    };
  });
  console.log('preview renders the linked drawing (9 lines, 10 dots):',
    preview && preview.lines === 9 && preview.circles === 10 ? 'PASS' : 'FAIL',
    JSON.stringify(preview));

  // 3. Load: applies the link and saves it, so a reload doesn't re-ask
  await page.click('#load-link');
  console.log('Load applies the linked drawing:', (await nodeCount()) === 10 ? 'PASS' : 'FAIL');
  await page.reload();
  console.log('after Load, reload keeps it without prompting:',
    !(await dialogOpen()) && (await nodeCount()) === 10 ? 'PASS' : 'FAIL');

  // 4. Keep mine: dismisses, keeps saved state, clears the hash
  const box2 = await page.locator('.node[data-index="0"] .hit').boundingBox();
  await page.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2);
  await page.mouse.down();
  await page.mouse.move(300, 300, { steps: 5 });
  await page.mouse.up(); // now saved state differs from the fixture again
  const keptPos = await nodePos();
  await page.goto(`${APP}#${FIXTURE}`);
  await page.reload();
  console.log('prompt shown again after divergence:', (await dialogOpen()) ? 'PASS' : 'FAIL');
  await page.click('#keep-mine');
  let hashNow = FIXTURE;
  for (let i = 0; i < 20 && hashNow === FIXTURE; i++) {
    await new Promise(r => setTimeout(r, 200));
    hashNow = await page.evaluate(() => location.hash.slice(1));
  }
  console.log('Keep mine keeps drawing, URL now holds my state:',
    (await nodePos()) === keptPos && hashNow && hashNow !== FIXTURE ? 'PASS' : 'FAIL');

  // 5. A link matching the saved state loads without a prompt
  await page.click('#share');
  await page.waitForFunction(() => location.hash.length > 1);
  await page.reload();
  console.log('link matching saved state loads silently:',
    !(await dialogOpen()) && (await nodePos()) === keptPos ? 'PASS' : 'FAIL');

  await browser.close();
})();
