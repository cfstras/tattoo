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
  console.log('custom picture extracted and stored as strokes:',
    custom && custom.name === 'triangle.png' && custom.strokes[0].closed &&
    custom.strokes[0].pts.length === 256 ? 'PASS' : 'FAIL',
    custom ? `(${custom.strokes.length} strokes)` : '');
  // triangle sanity: outline bbox spans the normalized area; a flat
  // triangle has no interior lines
  const xs = custom.strokes[0].pts.map(p => p[0]);
  const ys = custom.strokes[0].pts.map(p => p[1]);
  console.log('custom outline has sane bounds:',
    Math.max(...xs) > 0.9 && Math.max(...ys) > 0.9 ? 'PASS' : 'FAIL');
  console.log('flat shape yields no interior lines:',
    custom.strokes.every(st => st.closed) ? 'PASS' : 'FAIL');

  // --- Bright object on dark background (photo-style, no alpha) ---
  const bright = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 160; c.height = 120;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#101020'; ctx.fillRect(0, 0, 160, 120); // dark bg, opaque
    ctx.fillStyle = '#e8e8ff'; ctx.fillRect(40, 20, 80, 80); // bright object
    return c.toDataURL('image/jpeg', 0.95);
  });
  fs.writeFileSync(require('os').tmpdir() + '/bright.jpg',
    Buffer.from(bright.split(',')[1], 'base64'));
  await page.click('#settings-btn');
  const [chooser3] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.evaluate(() => { document.querySelectorAll('.pic-row .pic-upload')[2].click(); }),
  ]);
  await chooser3.setFiles(require('os').tmpdir() + '/bright.jpg');
  await page.waitForFunction(() =>
    [...document.querySelectorAll('.pic-row select')[2].options].some(o => o.text === 'bright.jpg'));
  await page.click('#apply-settings');
  const brightPic = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('node-drawing-layers-v1'))[2].pic);
  const bxs = brightPic.strokes[0].pts.map(p => p[0]);
  const bys = brightPic.strokes[0].pts.map(p => p[1]);
  const squarish = Math.abs((Math.max(...bxs) - Math.min(...bxs)) -
    (Math.max(...bys) - Math.min(...bys))) < 0.25;
  console.log('bright object on dark photo is detected:',
    brightPic && brightPic.strokes[0].pts.length === 256 && squarish ? 'PASS' : 'FAIL');

  // --- Interior lines: square with a contrasting diagonal seam ---
  const lined = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 160; c.height = 160;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 160, 160); // light bg, opaque
    ctx.fillStyle = '#202020'; ctx.fillRect(20, 20, 120, 120); // dark object
    ctx.strokeStyle = '#c0c0c0'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(30, 30); ctx.lineTo(130, 130); ctx.stroke();
    return c.toDataURL('image/jpeg', 0.95);
  });
  fs.writeFileSync(require('os').tmpdir() + '/lined.jpg',
    Buffer.from(lined.split(',')[1], 'base64'));
  await page.click('#settings-btn');
  const [chooser4] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.evaluate(() => { document.querySelectorAll('.pic-row .pic-upload')[2].click(); }),
  ]);
  await chooser4.setFiles(require('os').tmpdir() + '/lined.jpg');
  await page.waitForFunction(() =>
    [...document.querySelectorAll('.pic-row select')[2].options].some(o => o.text === 'lined.jpg'));
  await page.click('#apply-settings');
  const linedPic = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('node-drawing-layers-v1'))[2].pic);
  const interior = linedPic.strokes.filter(st => !st.closed);
  const diagonal = interior.some(st => {
    const dx = st.pts[st.pts.length - 1][0] - st.pts[0][0];
    const dy = st.pts[st.pts.length - 1][1] - st.pts[0][1];
    return Math.hypot(dx, dy) > 0.4 && Math.abs(Math.abs(dx) - Math.abs(dy)) < 0.35;
  });
  console.log('interior seam extracted as an open stroke:',
    interior.length >= 1 && diagonal ? 'PASS' : 'FAIL',
    `(${interior.length} interior lines)`);

  // --- Multi-stroke picture: approximation still converges ---
  await page.click('#settings-btn');
  await page.click('#approximate');
  await page.click('#do-approx');
  await page.click('.speed[data-speed="max"]');
  await page.waitForFunction(() => window.__approx && window.__approx.done,
    null, { timeout: 90000 });
  console.log('approximation converges with interior-line picture:', 'PASS');

  // --- Legacy custom pic (bare points array) still loads ---
  await page.evaluate(() => {
    const layers = JSON.parse(localStorage.getItem('node-drawing-layers-v1'));
    layers[2].pic = { name: 'legacy.png',
      points: Array.from({ length: 12 }, (_, i) => [i / 12, (i * 7 % 12) / 12]) };
    localStorage.setItem('node-drawing-layers-v1', JSON.stringify(layers));
  });
  await page.reload();
  await page.click('#settings-btn');
  const legacyOk = await page.evaluate(() => ({
    sel: document.querySelectorAll('.pic-row select')[2].value,
    thumb: document.querySelectorAll('.pic-thumb')[2].querySelectorAll('polygon').length,
  }));
  console.log('legacy points-format picture still loads:',
    legacyOk.sel === 'custom' && legacyOk.thumb === 1 ? 'PASS' : 'FAIL',
    JSON.stringify(legacyOk));
  await page.click('#cancel-settings');

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
