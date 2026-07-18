const { chromium } = require('playwright');
const APP = 'file://' + require('path').resolve(__dirname, '..', 'index.html');


(async () => {
  const browser = await chromium.launch(process.env.CHROMIUM_PATH || require('fs').existsSync('/opt/pw-browsers/chromium')
  ? { executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' } : {});
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await page.goto(APP);

  const nodePos = () => page.evaluate(() =>
    document.querySelector('.node[data-index="0"]').getAttribute('transform'));

  const initial = await nodePos();

  // Drag node 1 to the center
  const box = await page.locator('.node[data-index="0"] .hit').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(600, 450, { steps: 10 });
  await page.mouse.up();
  const dragged = await nodePos();
  console.log('drag works:', dragged !== initial ? 'PASS' : 'FAIL');

  // Reset -> modal appears
  await page.click('#reset');
  const modalOpen = await page.evaluate(() => document.getElementById('confirm-reset').open);
  console.log('modal opens:', modalOpen ? 'PASS' : 'FAIL');

  // Cancel -> modal closes, node stays where it was dragged
  await page.click('#cancel-reset');
  const afterCancel = await nodePos();
  const modalClosedAfterCancel = await page.evaluate(() => !document.getElementById('confirm-reset').open);
  console.log('cancel keeps layout:', modalClosedAfterCancel && afterCancel === dragged ? 'PASS' : 'FAIL');

  // Reset -> confirm -> node back at initial position
  await page.click('#reset');
  await page.click('#do-reset');
  const afterConfirm = await nodePos();
  console.log('confirm resets layout:', afterConfirm === initial ? 'PASS' : 'FAIL');

  // Escape also closes the dialog
  await page.click('#reset');
  await page.keyboard.press('Escape');
  const modalClosedAfterEsc = await page.evaluate(() => !document.getElementById('confirm-reset').open);
  console.log('escape closes modal:', modalClosedAfterEsc ? 'PASS' : 'FAIL');

  await browser.close();
})();
