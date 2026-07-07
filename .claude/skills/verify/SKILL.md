---
name: verify
description: Run the invariant suite (run.sh) and drive the single-file app in headless Chromium to verify changes end-to-end.
---

# Verifying workload-tracker changes

There is no build or server — `index.html` IS the app. Verify by driving it
in headless Chromium via Playwright and asserting on localStorage + DOM.

## Invariant suite — run this first

`.claude/skills/verify/run.sh` runs the repo's invariant suite (`suite/*.js`):
quarter-hour billing, recurrence advancement, plannedItems windowing, relay
bill-once + mirror, hand-off hours-move-once, team-board invariants, the
timesheet two-lenses rule, and an XSS scenario that seeds hostile strings
into every store. **Run it after any change to calculations, rendering, or
the relay/hand-off flow** — it installs its own playwright-core outside the
repo and finds the preinstalled Chromium automatically. Filter with an
argument: `run.sh 05` runs the hand-off scenario only. Add a scenario when
you add an invariant.

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
   tour). Gotcha: `load()` JSON.parses and silently falls back on failure, so
   string values must be JSON-encoded — seed `wt_team_view` as `'"board"'`,
   not `'board'` (a bare string reads as the fallback, e.g. list view).
   Then `page.goto('file:///home/user/workload-tracker/index.html')` —
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
