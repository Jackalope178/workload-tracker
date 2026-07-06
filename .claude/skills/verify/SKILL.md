---
name: verify
description: Drive the single-file app in headless Chromium to verify a change end-to-end (no test suite exists — runtime observation is the only check).
---

# Verifying workload-tracker changes

There is no build, test suite, or server — `index.html` IS the app. Verify by
driving it in headless Chromium via Playwright and asserting on localStorage +
screenshots.

## Recipe that works (Claude Code on the web environment)

1. `npm install playwright-core` in the scratchpad dir (repo has no deps — never add them here).
2. Launch with the pre-installed browser:
   ```js
   const { chromium } = require('playwright-core');
   const browser = await chromium.launch({
     executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', // ls /opt/pw-browsers for the current version
     headless: true
   });
   ```
3. Seed state BEFORE load with `page.addInitScript` writing `wt_*` localStorage
   keys (arrays JSON-stringified; set `wt_onboarded: '1'` to skip the welcome
   tour). Then `page.goto('file:///home/user/workload-tracker/index.html')` —
   `file://` works fine, no server needed. Wait ~2.5s for init.
4. The app runs in offline mode when CDN/Supabase are unreachable — everything
   except cloud sync still works.

## Driving tips

- All state and functions are globals: `page.evaluate(() => openEditModal('_t1'))`,
  read results from `localStorage` or the `tasks`/`teamItems` globals directly.
- `_switchTab(el)` takes the tab **DOM element**, not a name:
  `_switchTab(document.querySelector('.tab[data-tab="team"]'))`.
- Capture `page.on('dialog')` — confirm()/prompt() are used for destructive paths.
- Toasts: assert on `document.getElementById('syncToastMsg').textContent`.
- Math checks: call `plannedItems(from, to)` in the page and assert on the result.
- Watch `page.on('pageerror')` — a thrown error mid-handler silently truncates
  the rest of that user action.
