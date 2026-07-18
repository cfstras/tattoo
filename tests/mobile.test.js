const { chromium } = require('playwright');
const APP = 'file://' + require('path').resolve(__dirname, '..', 'index.html');

(async () => {
  const browser = await chromium.launch(
    process.env.CHROMIUM_PATH || require('fs').existsSync('/opt/pw-browsers/chromium')
      ? { executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' } : {});
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(APP);
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  // --- All controls are real buttons (settings open so rows exist) ---
  await page.click('#settings-btn');
  const buttons = await page.evaluate(() => {
    const els = [...document.querySelectorAll(
      '.btn, dialog .actions > *, #add-layer, .layer-remove, .pic-upload, #approximate')];
    return {
      count: els.length,
      allReal: els.every(el => el.tagName === 'BUTTON' && el.type === 'button'),
    };
  });
  console.log('every control is a real <button type=button>:',
    buttons.allReal && buttons.count > 20 ? 'PASS' : 'FAIL', `(${buttons.count} controls)`);
  await page.click('#cancel-settings');

  // --- iOS drag ergonomics: no text selection, no double-tap zoom ---
  const css = await page.evaluate(() => ({
    bodySelect: getComputedStyle(document.body).userSelect,
    btnTouch: getComputedStyle(document.getElementById('reset')).touchAction,
    canvasTouch: getComputedStyle(document.getElementById('canvas')).touchAction,
  }));
  console.log('text selection disabled on the app UI:',
    css.bodySelect === 'none' ? 'PASS' : 'FAIL', JSON.stringify(css));
  console.log('buttons use touch-action manipulation:',
    css.btnTouch === 'manipulation' ? 'PASS' : 'FAIL');
  console.log('canvas blocks scroll/zoom gestures for dragging:',
    css.canvasTouch === 'none' ? 'PASS' : 'FAIL');

  // --- Phone viewport during a run: bars wrap, buttons never overlap ---
  await page.click('#settings-btn');
  await page.click('#approximate');
  await page.click('#do-approx');
  const overlaps = await page.evaluate(() => {
    const rects = [...document.querySelectorAll('#bar .btn')]
      .filter(b => b.offsetParent !== null)
      .map(b => ({ id: b.textContent, r: b.getBoundingClientRect() }));
    const bad = [];
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i].r, b = rects[j].r;
        if (a.left < b.right - 1 && b.left < a.right - 1 &&
            a.top < b.bottom - 1 && b.top < a.bottom - 1) {
          bad.push(rects[i].id + '/' + rects[j].id);
        }
      }
    }
    return { count: rects.length, bad };
  });
  console.log('10 buttons visible during a run on a phone:',
    overlaps.count === 10 ? 'PASS' : 'FAIL', `(${overlaps.count})`);
  console.log('no overlapping buttons at 390x844:',
    overlaps.bad.length === 0 ? 'PASS' : 'FAIL', JSON.stringify(overlaps.bad));

  await browser.close();
})();
