// Tar skärmdumpar av experimenten och skriver ut konsolfel.
// Kräver att `npm run preview` (port 4173) eller `npm run dev` körs.
// Användning: node scripts/screenshot.cjs [id ...] [--url http://localhost:5173]
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

let playwright;
try {
  playwright = require('playwright');
} catch {
  playwright = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
}

const args = process.argv.slice(2);
const urlIdx = args.indexOf('--url');
const base = urlIdx >= 0 ? args.splice(urlIdx, 2)[1] : 'http://localhost:4173';
const ids = args.length ? args : ['pbr', 'shader', 'instancing', 'bloom'];
const outDir = path.join(__dirname, '..', 'screenshots');
fs.mkdirSync(outDir, { recursive: true });

(async () => {
  const browser = await playwright.chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const problems = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
  for (const id of ids) {
    await page.goto(`${base}/#${id}`);
    await page.waitForTimeout(2500);
    const file = path.join(outDir, `${id}.png`);
    await page.screenshot({ path: file });
    console.log(file);
  }
  await browser.close();
  console.log(problems.length ? problems.join('\n') : 'Inga konsolfel eller varningar.');
})();
