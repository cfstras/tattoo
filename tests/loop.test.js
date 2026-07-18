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

  const edgeCounts = p => p.evaluate(() => {
    const c = {};
    for (const line of document.querySelectorAll('.edge')) {
      const li = line.getAttribute('data-layer');
      c[li] = (c[li] || 0) + 1;
    }
    return c;
  });
  const nodePos = () => page.evaluate(() =>
    document.querySelector('.node[data-index="0"]').getAttribute('transform'));

  const setLoop = async (checked) => {
    await page.click('#settings-btn');
    await page.evaluate(v => { document.getElementById('close-loop').checked = v; }, checked);
    await page.click('#apply-settings');
  };

  // Default: chains are open
  let c = await edgeCounts(page);
  console.log('default open chains (99/49/24):',
    c['0'] === 99 && c['1'] === 49 && c['2'] === 24 ? 'PASS' : 'FAIL', JSON.stringify(c));

  // Enable the ring: one extra edge per layer, no reset warning, positions kept
  const posBefore = await nodePos();
  await setLoop(true);
  const warning = await page.evaluate(() => document.getElementById('confirm-reset').open);
  console.log('ring toggle skips reset warning:', !warning ? 'PASS' : 'FAIL');
  c = await edgeCounts(page);
  console.log('rings closed (100/50/25):',
    c['0'] === 100 && c['1'] === 50 && c['2'] === 25 ? 'PASS' : 'FAIL', JSON.stringify(c));
  console.log('positions unchanged:', (await nodePos()) === posBefore ? 'PASS' : 'FAIL');

  // The wrap edge really connects last member to first (layer 0: node 100 -> node 1)
  const wrapOk = await page.evaluate(() => {
    const lines = [...document.querySelectorAll('[data-layer="0"]')];
    const wrap = lines[lines.length - 1];
    const at = (x, y) => [...document.querySelectorAll('.node')].find(g =>
      g.getAttribute('transform') === `translate(${x}, ${y})`);
    const a = +at(wrap.getAttribute('x1'), wrap.getAttribute('y1')).dataset.index + 1;
    const b = +at(wrap.getAttribute('x2'), wrap.getAttribute('y2')).dataset.index + 1;
    return a === 100 && b === 1;
  });
  console.log('wrap edge connects node 100 to node 1:', wrapOk ? 'PASS' : 'FAIL');

  // Persists across reload
  await page.reload();
  c = await edgeCounts(page);
  console.log('ring setting persists after reload:', c['0'] === 100 ? 'PASS' : 'FAIL');

  // Travels in share links
  await page.click('#share');
  await page.waitForFunction(() => location.hash.length > 1);
  const url = await page.evaluate(() => location.href);
  const context2 = await browser.newContext();
  const page2 = await context2.newPage();
  await page2.goto(url);
  c = await edgeCounts(page2);
  console.log('share link carries ring setting:',
    c['0'] === 100 && c['1'] === 50 && c['2'] === 25 ? 'PASS' : 'FAIL', JSON.stringify(c));
  await context2.close();

  // Old open-chain links force the ring OFF even with it enabled locally
  const openHash = '3CgEAZABkAMgAyAAsASwBkAGQAfQB9AFYAlgCvAK8AiADIAOEA4QD6APoAw';
  await page.goto(`${APP}#${openHash}`);
  await page.reload();
  c = await edgeCounts(page);
  console.log('legacy v3 link loads open chains:', c['0'] === 9 ? 'PASS' : 'FAIL', JSON.stringify(c));

  // Disable again
  await page.goto(APP);
  await setLoop(false);
  c = await edgeCounts(page);
  console.log('ring disabled again (open chains):', c['0'] === 99 ? 'PASS' : 'FAIL');

  await browser.close();
})();
