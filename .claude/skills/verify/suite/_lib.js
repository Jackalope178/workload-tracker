// Shared harness for the invariant suite. Each scenario seeds localStorage,
// drives the real app in headless Chromium, and asserts on state/DOM.
// Run everything via ../run.sh (it provides playwright-core + WT_CHROME).
const path = require('path');
const { chromium } = require('playwright-core');

const APP = 'file://' + path.resolve(__dirname, '..', '..', '..', '..', 'index.html');

let failures = 0;

// Seed values: strings are written verbatim (load() falls back to the raw
// string only if JSON.parse fails — so JSON-encode strings: '"board"').
async function launch(seed) {
  const browser = await chromium.launch({
    executablePath: process.env.WT_CHROME,
    headless: true
  });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  page.on('pageerror', e => { console.log('  💥 PAGE ERROR:', e.message); failures++; });
  page.on('dialog', d => d.accept());
  await page.addInitScript(s => {
    for (const [k, v] of Object.entries(s)) {
      localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
    }
  }, Object.assign({ wt_onboarded: '1' }, seed || {}));
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  return { browser, page };
}

function step(name, ok, detail) {
  console.log(`  ${ok ? '✅' : '❌'} ${name}${detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`);
  if (!ok) failures++;
}

function done(browser) {
  const p = browser ? browser.close() : Promise.resolve();
  return p.then(() => { if (failures) process.exit(1); });
}

module.exports = { launch, step, done };
