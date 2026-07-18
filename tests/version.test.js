const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');

const APP = 'file://' + path.resolve(__dirname, '..', 'index.html');

(async () => {
  const browser = await chromium.launch(
    process.env.CHROMIUM_PATH || fs.existsSync('/opt/pw-browsers/chromium')
      ? { executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' } : {});
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });

  // --- Unstamped build shows 'dev' bottom-right in small grey ---
  await page.goto(APP);
  const dev = await page.evaluate(() => {
    const el = document.getElementById('version');
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      text: el.textContent,
      fixed: cs.position === 'fixed',
      color: cs.color,
      size: parseFloat(cs.fontSize),
      bottomRight: r.right > innerWidth - 60 && r.bottom > innerHeight - 30,
    };
  });
  console.log('dev build shows dev label:', dev.text === 'dev' ? 'PASS' : 'FAIL', dev.text);
  console.log('version sits bottom-right, small and grey:',
    dev.fixed && dev.bottomRight && dev.size <= 12 &&
    dev.color.replace(/\s/g, '') === 'rgb(86,91,107)' ? 'PASS' : 'FAIL',
    JSON.stringify(dev));

  // --- CI stamping: placeholder replaced exactly like the workflow does ---
  const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
  console.log('placeholder present exactly once:',
    (html.match(/__APP_VERSION__/g) || []).length === 1 ? 'PASS' : 'FAIL');
  const stamped = path.join(os.tmpdir(), 'stamped-index.html');
  fs.writeFileSync(stamped, html.replace('__APP_VERSION__', '9.9.9'));
  await page.goto('file://' + stamped);
  const shown = await page.evaluate(() =>
    document.getElementById('version').textContent);
  console.log('stamped build shows semantic version:',
    shown === 'v9.9.9' ? 'PASS' : 'FAIL', shown);

  await browser.close();
})();
