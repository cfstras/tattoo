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

  // --- Conventional-commit version bumps (scripts/version.sh) ---
  const { execSync } = require('child_process');
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'ver-'));
  const sh = cmd => execSync(cmd, { cwd: repo, encoding: 'utf8' }).trim();
  sh('git init -q && git config user.email t@t && git config user.name t');
  fs.mkdirSync(path.join(repo, 'scripts'));
  fs.copyFileSync(path.resolve(__dirname, '..', 'scripts', 'version.sh'),
    path.join(repo, 'scripts', 'version.sh'));
  fs.writeFileSync(path.join(repo, 'VERSION'), '1.2.3\n');
  sh('git add -A && git commit -qm "chore: base"');
  const versions = [];
  for (const [msg, expect] of [
    ['fix: patch bump', '1.2.4'],
    ['docs: also a patch bump', '1.2.5'],
    ['feat(ui): minor bump resets patch', '1.3.0'],
    ['refactor!: breaking bump resets all', '2.0.0'],
    ['chore: back to patching', '2.0.1'],
  ]) {
    sh(`git commit -q --allow-empty -m "${msg}"`);
    versions.push([expect, sh('bash scripts/version.sh')]);
  }
  console.log('conventional commits drive the version:',
    versions.every(([e, g]) => e === g) ? 'PASS' : 'FAIL', JSON.stringify(versions));

  // --- commit-msg hook accepts/rejects the right subjects ---
  const hook = path.resolve(__dirname, '..', '.githooks', 'commit-msg');
  const tryMsg = msg => {
    const f = path.join(os.tmpdir(), 'msg.txt');
    fs.writeFileSync(f, msg + '\n');
    try { execSync(`sh ${hook} ${f}`, { stdio: 'pipe' }); return true; }
    catch (e) { return false; }
  };
  const good = ['feat: add thing', 'fix(scope): repair', 'feat!: breaking',
    'chore: tidy', 'Merge branch main', 'Revert "feat: x"'];
  const bad = ['add thing without a type', 'feature: wrong type', 'fix:missing space', 'fix: '];
  console.log('hook accepts conventional subjects:',
    good.every(tryMsg) ? 'PASS' : 'FAIL');
  console.log('hook rejects malformed subjects:',
    bad.every(m => !tryMsg(m)) ? 'PASS' : 'FAIL');
})();
