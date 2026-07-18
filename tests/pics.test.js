const { chromium } = require('playwright');
const fs = require('fs');

const APP = 'file://' + require('path').resolve(__dirname, '..', 'index.html');

(async () => {
  const browser = await chromium.launch(process.env.CHROMIUM_PATH || require('fs').existsSync('/opt/pw-browsers/chromium')
  ? { executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' } : {});
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const page = await context.newPage();
  await page.goto(APP);
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  const picState = () => page.evaluate(() =>
    [...document.querySelectorAll('.pic-row select')].map(s => s.value));

  // --- Defaults: tiger on layer 1, woman on layer 2, none on layer 3 ---
  await page.click('#settings-btn');
  let sels = await picState();
  console.log('default pictures tiger/woman/none:',
    JSON.stringify(sels) === '["tiger","woman","none"]' ? 'PASS' : 'FAIL', JSON.stringify(sels));
  const thumbs = await page.evaluate(() =>
    [...document.querySelectorAll('.pic-thumb')].map(t => t.querySelectorAll('polygon').length));
  console.log('thumbnails rendered for pictured layers:',
    JSON.stringify(thumbs) === '[1,1,0]' ? 'PASS' : 'FAIL', JSON.stringify(thumbs));

  // --- Assign a built-in to layer 3, apply, persists across reload ---
  await page.evaluate(() => {
    const sel = document.querySelectorAll('.pic-row select')[2];
    sel.value = 'tiger';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.click('#apply-settings');
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('node-drawing-layers-v1')));
  console.log('applied pictures persist to storage:',
    stored[0].pic.builtin === 'tiger' && stored[1].pic.builtin === 'woman' &&
    stored[2].pic.builtin === 'tiger' ? 'PASS' : 'FAIL');
  await page.reload();
  await page.click('#settings-btn');
  sels = await picState();
  console.log('pictures restored after reload:',
    JSON.stringify(sels) === '["tiger","woman","tiger"]' ? 'PASS' : 'FAIL', JSON.stringify(sels));

  // --- None clears a picture ---
  await page.evaluate(() => {
    const sel = document.querySelectorAll('.pic-row select')[2];
    sel.value = 'none';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.click('#apply-settings');
  const cleared = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('node-drawing-layers-v1'))[2].pic === undefined);
  console.log('selecting none removes the picture:', cleared ? 'PASS' : 'FAIL');

  // --- Custom upload: triangle PNG through the real file chooser ---
  const triangle = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 120; c.height = 120;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.moveTo(60, 10); ctx.lineTo(110, 110); ctx.lineTo(10, 110);
    ctx.closePath(); ctx.fill();
    return c.toDataURL('image/png');
  });
  fs.writeFileSync(require('os').tmpdir() + '/triangle.png',
    Buffer.from(triangle.split(',')[1], 'base64'));

  await page.click('#settings-btn');
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.evaluate(() => {
      document.querySelectorAll('.pic-row .pic-upload')[2].click();
    }),
  ]);
  await chooser.setFiles(require('os').tmpdir() + '/triangle.png');
  await page.waitForFunction(() =>
    document.querySelectorAll('.pic-row select')[2].value === 'custom');
  console.log('upload sets a custom picture:', 'PASS');
  await page.click('#apply-settings');
  const custom = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('node-drawing-layers-v1'))[2].pic);
  console.log('custom contour extracted and stored:',
    custom && custom.name === 'triangle.png' && custom.points.length === 256 ? 'PASS' : 'FAIL',
    custom ? `(${custom.points.length} points)` : '');
  // triangle sanity: contour bbox should span the full normalized square-ish area
  const xs = custom.points.map(p => p[0]), ys = custom.points.map(p => p[1]);
  console.log('custom contour has sane bounds:',
    Math.max(...xs) > 0.9 && Math.max(...ys) > 0.9 ? 'PASS' : 'FAIL');

  // --- Unusable image: button flags 'no shape' instead of silence ---
  const blank = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 40; c.height = 40; // fully transparent
    return c.toDataURL('image/png');
  });
  fs.writeFileSync(require('os').tmpdir() + '/blank.png',
    Buffer.from(blank.split(',')[1], 'base64'));
  await page.click('#settings-btn');
  const [chooser2] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.evaluate(() => {
      document.querySelectorAll('.pic-row .pic-upload')[0].click();
    }),
  ]);
  await chooser2.setFiles(require('os').tmpdir() + '/blank.png');
  await page.waitForFunction(() =>
    document.querySelectorAll('.pic-row .pic-upload')[0].textContent === 'no shape');
  console.log('unusable image flags no shape:', 'PASS');
  const kept = await page.evaluate(() =>
    document.querySelectorAll('.pic-row select')[0].value);
  console.log('failed upload keeps the previous picture:', kept === 'tiger' ? 'PASS' : 'FAIL');

  await browser.close();
})();
