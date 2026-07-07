# PM Workload Tracker

A personal project-management cockpit for a PM ("KME") coordinating their own
billable work, a team's deliverables, timesheets, and forward capacity
planning — all in **one HTML file**.

- **GitHub repo:** Jackalope178/workload-tracker — push all changes directly using git push. Develop on main branch unless otherwise specified.
- **Live site:** https://jackalope178.github.io/workload-tracker/ (GitHub Pages deploys from `main` — work on unmerged branches is invisible in the app)
- **Supabase project:** fkgmgpfbfoadgjllttjd (config baked into the app)

**If you change only one habit:** navigate by grepping function names (there
are ~520), not by line numbers — they drift. The grep-anchor table below maps
tasks to entry points.

## Setup

No build step, no framework, no tests, no package manager, no dependencies to
install. The `package.json` exists only to satisfy the Claude Code on the web
environment setup script — never add dependencies to it. The environment
setup script (claude.ai/code settings) should be empty or `exit 0`.

**Run the invariant suite before shipping:** `.claude/skills/verify/run.sh`
drives the app in headless Chromium and asserts the documented invariants
(billing/recurrence/capacity math, relay bill-once, hand-off hours-move-once,
board rules, XSS escaping). Add a scenario under
`.claude/skills/verify/suite/` when you add an invariant. There is no other
test suite, linter, or build. For ad-hoc end-to-end checks,
`.claude/skills/verify/SKILL.md` records a working Playwright + Chromium
recipe (seed `wt_*` localStorage, drive the real UI, assert on state) —
including the gotcha that `load()` JSON-parses, so seeded string values must
be JSON-encoded. For pure calculation changes, extracting the touched
functions into a Node harness and simulating them is an effective check (see
`docs/math-audit-2026-07.md` for worked examples).

## The 30-second mental model

Everything is client-side vanilla JS operating on a handful of arrays in
`localStorage` (keys prefixed `wt_`), mirrored to a Supabase key-value table
when signed in. Each UI tab is a `render*()` function that rebuilds its panel
from state. Mutations go through `save(key, data)`, which writes localStorage
and fires `cloudSave()`.

```
state (localStorage wt_*)  ⇄  Supabase user_data (per-user KV of JSON blobs)
        │
        ▼
render*() rebuilds DOM per tab  ←  user actions mutate state → save() → re-render
```

External code comes from three CDNs: `@supabase/supabase-js@2.110.0` (sync),
`xlsx@0.18.5` (BigTime Excel import, with a fallback CDN retry), and Google
Fonts (Inter, Syne). The two `<script>` tags are **version-pinned with
Subresource Integrity** (`integrity="sha384-…"`) — see Security invariants
before bumping either version.

## File map — where things live in `index.html` (~16,700 lines)

Line numbers drift as the file grows; use them as landmarks and confirm with grep.

| Region | Approx. lines | Contents |
|---|---|---|
| CSS | 7–2,730 | One `<style>` block. **Light-only** (dark retired July 2026): permanent `data-theme="light"`; the dark `:root` variables remain as the base layer the light overrides sit on — don't remove either side. |
| CDN loads | 2,732–2,741 | Supabase, XLSX. |
| HTML body | 2,743–4,080 | Tab bar (`class="tabs"`, ~2,856), six tab panels, all modals. |
| Sync + auth | ~4,082–4,600 | `_supabase` client, login, `SYNC_KEYS` (~4,451), `cloudSave`/`cloudLoad`/`loadFromSupabase`. |
| Core helpers | ~5,139 | `uid()`, `load(key, fallback)`, `save(key, data)`. |
| Date/recurrence/timer helpers | ~5,280–5,760 | Timers, quarter-hour billing, `nextRecurrenceAfter`, pay periods. |
| Tab renderers + logic | ~5,900–end | The bulk of the app; see the tab table below. |

## The six tabs

| Tab | Purpose | Entry function(s) |
|---|---|---|
| **My Tasks** | Personal billable tasks: recurrence, timers, priority, week planner. | `renderTasks()`, `renderWeekPlanner()` |
| **Projects** | Project codes, metadata, members, per-project item lists. | `renderProjects()`, `renderProjCodeContent()` |
| **Team Deliverables** | Cross-team assignments with multi-stage **relay** hand-offs and per-person boards. | `renderTeam()`, `renderTeamBoard()` |
| **Timesheet** | Logged time per project; pay-period view (backward-looking) and month/year view (forward-looking). | `renderTimesheet()`, `renderTsCapacityBar()` |
| **Capacity** | 12-month personal headroom planner: logged + planned vs capacity, drill-down, scheduler board, move/delegate. Answers "someone needs this by May — do I have time?" All recurrences expand so future load is true. | `renderCapacity()`, `_renderCapMonthDetail()`, `_renderCapItemList()`, `capMoveItem()`, `capDelegateItem()` |
| **Allocations** | Budgeted vs actual hours per project/sub-code per month (BigTime import). Distinct from Capacity: Allocations = budget tracking, Capacity = personal headroom. | `renderAllocations()`, `handleAllocImport()` |

Tab switching: `_switchTab(tab)`; active tab persists in `wt_active_tab`.

## Data model

### Primary stores (localStorage, synced via `SYNC_KEYS`)

| Key | Contents |
|---|---|
| `wt_tasks` | Personal tasks: `{ id, name, project, subCode, priority, due, est, category, waiting, notes, recurrence, timer, timerStart, completed }`. Quick-captured tasks additionally carry `inbox: true` (awaiting triage in the 📥 Inbox section; cleared by saving the edit modal or setting a date inline). Delegation fields: `delegatedTo[]` (lightweight tag — task stays here but renders on the Team tab and leaves your Capacity) and `_deliverableId` (this task IS a relay-mirror leg of that `wt_team` item). |
| `wt_team` | Team deliverables: `{ id, name, owner, owners[], project, subCode, due, status, waiting, notes }` + relay fields (`relay[]`, `relayStage`, `activeOwner`, `reviewTaskId`, `relayLog[]`) |
| `wt_bigprojs` | Big projects (multi-session/subtask structures) |
| `wt_completed` | Archive of completed items — also the **billing ledger** (Timesheet/Allocations actuals read from here) |
| `wt_projects_meta` | Project definitions: `{ label, color, billingCode, subCodes[], tags[] }` |
| `wt_persons` | Team roster |
| `wt_allocations` | Monthly budget allocations, keyed `projKey|scId|YYYY-MM` |
| `wt_person_allocs` | Per-person monthly hour allocations by billing code, keyed `person|projKey|scId|YYYY-MM` (drives the person-board allocation meters; parse keys from the END — names may contain `|`) |

Plus ~20 smaller preference/UI keys (`wt_theme`, `wt_ts_capacity`, collapse
states, …). Anything that must survive across devices belongs in `SYNC_KEYS`.

### Conventions
- **IDs:** `uid()` = `'_' + Math.random().toString(36).slice(2, 11)`
- **Statuses:** `need-delegate`, `in-progress`, `ready-review`, `in-review`, `blocked`, `complete`
- **Priorities:** `urgent`, `high`, `med`, `low` (+ `meeting` in My Tasks)
- **Billing codes:** `T-21-010`, `W-24-022` style; sub-codes live under projects
- **Internal composite objects** (used by planners): `_type` (`task` | `session` | `team`) with `_date`, `_src`, `_delegated`, `_taskDelegated`. The Team tab builds composite rows for delegated tasks/sessions/subtasks — any field the board/list/chips read (e.g. `waiting`, `est`, `priority`) must be copied into those composites in `renderTeam()` or it silently vanishes from the Team tab.
- **The `'Me'` sentinel:** the app owner is stored as `'Me'` everywhere, displayed as **"KME"** on the Team tab
- **Render pattern:** after mutating state, call the owning tab's `render*()`; don't patch DOM incrementally

## The relay / KME flow — read before touching Team, My Tasks mirroring, or billing

The single most interconnected subsystem. A Team deliverable can carry a
**relay**: an ordered list of stages (`kind ∈ work | review | send`), each
with an assignee, estimate, and due date. When the baton reaches a `'Me'`
stage, the app creates a **mirror task** in `wt_tasks` so the owner's leg
shows in My Tasks, counts in Capacity, and bills once (never twice) to
`wt_completed` on pass or checkbox-complete.

The bridge runs both ways: **⇄ Hand off as deliverable** (task and work-item
edit modals) converts a personal item INTO a `wt_team` relay pre-seeded
`Work — <person>` → `Review — Me`, deleting the source so the hours have
exactly one home (see Math invariant #7 and the delegation SOP below).

**Full documentation and design-intent log: `docs/team-relay-and-kme-flow.md`.**
Keep its intent log updated when changing relay behavior.

## ADHD ergonomics (My Tasks) — deliberate design layer, don't strip as "clutter"

- **Quick capture → Inbox:** the box above the toolbar (`quickCaptureAdd`, `N`
  key; `Shift+N` opens the full form) creates bare `inbox: true` tasks; the 📥
  Inbox section holds them for later triage. Capture must stay one-field,
  zero-decision; inbox tasks carry no date/estimate so they can't pollute
  Capacity or day-fit math before triage.
- **Completion celebration:** `_celebrateWin` (confetti + win toast +
  wins/streak chip via `_updateWinsChip`) fires from every `confirmComplete`
  path. Completing work must never be visually silent.
- **Focus mode:** `_focusMode` (`wt_focus_mode`, 🎯 toolbar button) shows
  Overdue + Today in full, urgent first. Everything else renders as dimmed
  one-line **parked stubs** with live counts (`_focusStubs`), click-to-peek via
  `_focusPeek`/`_focusPeekToggle` — **never fully hidden** (hiding sections
  outright caused real object-permanence panic; keep the whole map on screen).
  `_startNextQueue`/`_focusStartNext` power the "▶ Start next" chip in the
  Today header (starts the timer on the most urgent item — kills task-picking
  paralysis). `wt_focus_mode` is deliberately **not** in `SYNC_KEYS` — it's a
  device-local view mode (like `wt_task_view`), so one machine's focus state
  never hides tasks on another.
- **Day-fit lens:** `_fitStatus(logged, planned, cap)` drives day/week section
  status text ("DOESN'T FIT" / "FREE AFTER PLAN" / "CLEAR"). This is a
  *planning* lens; the pay-period bar above the list stays a *billing* lens
  (logged vs target, "banked" framing) — keep the two framings distinct (this
  mirrors invariant #1 below).

## Invariants — deliberate design, do NOT "fix"

These look like inconsistencies or bugs but are intentional. Violating them is a regression:

1. **Timesheet pay-period view ≠ month view math.** Period bars = **logged
   only** vs capacity (backward-looking record). Month/year bars = **logged +
   planned** vs capacity (forward-looking headroom), with class-based
   green/yellow/red coloring (`mCls`/`wCls`) that differs from period view's
   inline color logic. Never unify them.
2. **A KME relay item appears twice by design** — on the team board (stage
   `est` rollups) and as a My-Tasks mirror (which is what Capacity counts).
   The two meters are intentionally non-additive; `plannedItems()` excludes
   `wt_team` items to prevent double-counting.
3. **Checkbox-completing a relay mirror advances the relay with 0 extra
   hours** — the completion modal already logged them; the 0 prevents
   double-billing.
4. **Relay stages have no label field** and `ready-review` + `in-review`
   share one merged board column (`BOARD_COLS` in `renderTeamBoard`).
5. **Relay → mirror sync is one-way.** Editing the mirror task never updates
   the relay stage.
6. **One billing code per deliverable.** All relay legs bill to the
   deliverable's `project`+`subCode`; stages don't carry their own code.
7. **Month holds** (`allocMonth` set, no date) count in month totals but are
   deliberately excluded from period/week/day bars and never pin to a day.
8. **Meetings are priority-routed and status-less on the board** (July 2026).
   Anything meeting-priority routes to the board's **Meetings** column;
   active meeting cards render **no status badge** at all (a meeting has no
   settable status — completed ones show Complete in the Complete column).
   The Blocked column is gone (blocked cards fold into In Progress with a 🚫
   badge) and the person-cockpit deliberately has **no Blocked chip** — the
   toolbar status filter is how you isolate blocked. Don't "restore" any of
   these.
9. **Person-board solo cards show no baton line.** On X's board, a non-relay
   card X solely owns renders "Solo" without "◖ X's turn" — the missing
   baton is deliberate de-duplication, not a bug. It still shows with
   co-owners, when the ball is elsewhere, and on the Everyone board.
10. **Board view preferences are device-local**, never in `SYNC_KEYS` — same
   rule as `wt_focus_mode`/`wt_task_view`: `wt_team_view`,
   `wt_team_board_person`, and `wt_team_board_sort` (🗂 project-grouped with
   headers vs 📅 nearest-due flat, where each card carries a project
   dot + name line instead).

## Math Invariants (July 2026 audit)

`docs/math-audit-2026-07.md` is the full audit record — 11 verified findings,
what was fixed and how, and which behaviors are intentional. **Read it before
changing any calculation.** The fixes established invariants later work must
preserve:

1. **Recurrence must strictly advance.** `nextRecurrenceAfter` wraps
   `_nextRecurrenceAfterRaw` with a monotonic guard (non-advancing result →
   `null`) — never call the raw function directly. When advancing a stored
   anchor (completion, skip, reschedule) use `nextActiveRecurrenceAfter`,
   which also steps past `recurrence.skips`; expansion loops use
   `nextRecurrenceAfter` and filter skips themselves. Two follow-on rules:
   **always call it with an occurrence as `from`** (monthly/monthly-weekday
   start at the next month; biweekly parity anchors to `from`'s week), and
   **plain-monthly builders stamp `dayOfMonth`** via `_monthlyIntentDay` so
   a short month's clamp doesn't drift the anchor (Jan 31 → Feb 28 → Mar 31,
   not Mar 28 forever).
2. **`plannedItems(from, to)` only returns items dated inside the window.**
   Rescheduled occurrences are windowed by their override date, and
   occurrences moved INTO the window are picked up from the overrides map.
   Aggregate callers rely on this and sum without re-filtering. Exception:
   month holds (`_allocHold`) carry a placeholder `allocMonth + '-15'` date
   and are filtered/handled specially by every consumer.
3. **Placement = `workDate || due` everywhere.** Anything that moves or
   schedules an item must go through `_capAssignOne` / `_applyWorkPick` (or
   explicitly clear `workDate`); writing `due`/`date` directly strands the
   hours on the old work date.
4. **Billing is quarter-hours, never negative.** `enforceQuarter` guards
   every saved hours value and clamps at 0 (typed negatives would silently
   subtract from capacity/billing sums). `roundToQuarter` has a 0.25 FLOOR —
   never use it on a possibly-zero quantity (use `snapQuarter` clamped at 0,
   as `packIntoFreeDays` does).
5. **Person-board meters are allocation meters** (July 2026 — replaced the
   weekly-capacity gauge): bar = `wt_person_allocs` for the selected month,
   solid fill = `_personCompletedHoursByCode` (relay `relayLog` pass hours —
   teammate legs record stage est, KME legs record logged hours — plus
   `completedAt`/`ownerStatusAt`-stamped completions), overlay = active
   planned est. A no-sub-code allocation is a **catch-all**: it absorbs the
   project's hours not claimed by a sub-code-specific bar that month. Card
   badges still show the person's total stage hours (`_relayPersonEst`);
   remaining-legs math (`_relayPersonRemainingEst`) still feeds the backlog
   line. Don't unify any of these.
6. **Timesheet month-view week rows use the true Sun–Sat week** for logged,
   planned, AND capacity. Boundary weeks intentionally pull from the adjacent
   month and appear under both months — week bars don't sum to the month bar.
7. **Hand-off moves hours exactly once** (July 2026). Converting a
   task/session/subtask into a deliverable (`_handoffCreateDeliverable`
   callers) **deletes the source item** — Capacity drops it, the person's
   board gains the work leg, and the Me review leg re-enters later via the
   baton mirror. Three guards keep the totals honest: a handed-off
   **subtask's hours are subtracted from its parent session's total**
   (otherwise the parent's un-subtasked remainder grows back and the hours
   count twice); **done work blocks / done subtasks are excluded** from the
   deliverable's est (they were billed at completion); a session with
   **open subtasks refuses** to convert. Recurring items never convert —
   recurring involvement is the `delegatedTo` tag, which keeps the person
   on every occurrence.

Known-open minor item (deliberate — see the audit's Minor section): `fmtQ`
snaps legacy non-quarter values for display only (sums use raw values). The
audit's other minor items (rounded color thresholds, negative import
allocations, weekend 15th in `capMoveItem`) were subsequently fixed.

## Sync architecture

- `save(key, data)` → localStorage + `cloudSave(key, data)` (upsert into
  Supabase `user_data`, conflict key `user_id,key`, payload `{ value: <blob> }`).
  `save()` also invalidates the actuals/planned caches — raw `localStorage`
  writes bypass both sync and cache invalidation; never use them.
- On sign-in, `loadFromSupabase()` pulls all keys and overwrites local state.
- Offline / signed-out mode works fully on localStorage; header shows "Offline".
- Supabase URL/key default to the baked-in project but can be overridden via
  the settings modal (`wt_supabase_config`).

## Task → grep anchor quick reference

| If the task touches… | Start by grepping… |
|---|---|
| Personal tasks, recurrence, timers | `function renderTasks`, `renderWeekPlanner`, `confirmComplete`, `nextRecurrenceAfter` |
| ADHD ergonomics (capture/inbox, wins, focus, day-fit) | `quickCaptureAdd`, `_celebrateWin`, `_focusMode`, `_fitStatus`, `_startNextQueue` |
| Team board, statuses, relay/hand-offs | `renderTeamBoard`, `relayStatusInfo`, `_relaySync`, `relayAdvance` |
| Person-board allocation meters / meetings column | `personAllocKey`, `_personCompletedHoursByCode`, `openPersonAllocModal`, `BOARD_COLS` |
| KME mirror tasks / My-Tasks ↔ Team link | `_syncBatonMirror`, `_closeBatonMirror`, `_taskRelayPassBtn`, `_deliverableId` |
| Task/session → deliverable hand-off (delegation) | `_handoffCreateDeliverable`, `handoffTaskAsDeliverable`, `handoffSessionAsDeliverable`, `delegatedTo`, `capDelegateItem` |
| Billing / logged hours | `_logRelayLeg`, `wt_completed`, `roundToQuarter`, `enforceQuarter` |
| Timesheet bars & colors | `renderTimesheet`, `renderTsCapacityBar`, `mCls`, `wCls`, `payPeriodOf` |
| Capacity planner / drill-down / scheduler | `renderCapacity`, `plannedItems`, `capMoveItem`, `capDelegateItem`, `_allocHold`, `_capAssignOne` |
| Allocations / Excel import / rollovers | `renderAllocations`, `handleAllocImport`, `allocKey`, `_rollRemainingForward` |
| Reconcile view (plan vs budget, one month) | `_renderAllocReconcile`, `_allocProjMonthTotals`, `_allocReconShift` |
| Projects & metadata | `renderProjects`, `renderProjCodeContent`, `wt_projects_meta` |
| Cloud sync / auth | `SYNC_KEYS`, `cloudSave`, `loadFromSupabase` |
| In-app orientation / ⓘ help | `INFO_COPY`, `infoIcon`, `showWelcome`, `_TAB_TIPS` |
| Tabs / navigation | `_switchTab`, `data-tab` |
| Theming (light-only) | `applyTheme`, `data-theme`, `:root` |
| Person pill colors | `personColor`, `_personHueSat`, `wt_person_colors`, `renderPersonMetaList` |

## Working on this codebase

- **SOP — updating CLAUDE.md is part of the change.** This file is the
  contract for every future session; one that describes the previous version
  of the app is a bug. When a change adds or alters an invariant, a
  deliberate "looks wrong, isn't" behavior, an SOP, a data-model field, a
  preference key, or a subsystem entry point, update the matching section
  here **in the same commit** — new grep-worthy functions go in the anchor
  table, new quirks go in the invariants lists — and mirror the substance in
  `README.md`.
- **Single-file discipline:** all HTML/CSS/JS changes go in `index.html`. Docs go in `docs/`.
- **`README.md` is the human-facing mirror of this file** (for GitHub
  visitors). When structure changes here, keep it in sync.
- **New persistent state?** Add the key to `SYNC_KEYS` if it should follow the
  user across devices; use the `load`/`save` wrappers, never raw `localStorage`.
- **Touching relay, the My-Tasks mirror, or team-board status?** Read
  `docs/team-relay-and-kme-flow.md` first and append to its intent log.
- **Touching any calculation?** Read `docs/math-audit-2026-07.md` first and
  preserve the invariants above.
- **SOP — delegation surfaces stay mirrored across tabs.** Every entry modal
  for personal work (task modal on My Tasks/Projects, work-item/subtask modal
  on Projects) offers BOTH delegation weights side by side: **Assign-to pills**
  (lightweight tag — item stays put, right for recurring involvement) and
  **⇄ Hand off as deliverable** (item converts to a `wt_team` relay via the
  shared `_handoffCreateDeliverable`/`_handoffOpenPicker` helpers — never
  reimplement the conversion inline). Anywhere items render with people
  attached, use the same pill language: `delegateTagsHtml` for tagged items
  AND deliverable owners (👤 rows). Adding a new entry surface or item list =
  add both affordances and the pills in the same change.
- **SOP — keep the in-app orientation current.** Whenever a feature is added
  or a meter/board changes what it counts, update all three help surfaces as
  part of the same change: (1) the ⓘ popover copy (`INFO_COPY` — one entry
  per component, plain-English "what does this count"), (2) the welcome tour
  (`welcomeOverlay` steps in the HTML + `_WELCOME_STEPS`), and (3) the
  per-tab help panel (`_TAB_TIPS`). Stale orientation is a bug: tips must
  never reference features that don't exist or describe old math.

## Security invariants — DO NOT regress these

These were hardened in a security audit (see `docs/security-audit-2026-07.md`).
A change that "cleans up" or "simplifies" any of them reintroduces a real bug.

1. **Escape user/import data before it hits `innerHTML`.** Any field a user or a
   spreadsheet import can set — project `label`/`billingCode`, project/session
   `name`, sub-code `code`/`label`, person/owner names, `_currentUser` display
   name — MUST be wrapped in `escHtml(...)` when interpolated into a template
   literal that becomes `innerHTML`/`outerHTML`. Task `name`/`notes`/`waiting`
   are already escaped; match that pattern. `escHtml` escapes `& < > " ' \``;
   do not "trim" it back down. Values are stored raw and escaped only at render,
   so a missed sink = stored XSS (reachable via a crafted `.xlsx` import).
   When in doubt, escape. Rendering via `.textContent` / `.value =` is already
   safe and needs no escaping.
2. **Person names inside inline `onclick`/`onchange` need dual escaping**, not
   `escHtml`. Use `.replace(/'/g,"\\'").replace(/"/g,'&quot;')` (see
   `showPersonStatusDropdown` / `setPersonWeeklyCap` / `showReassignDropdown`
   call sites). A plain HTML-escape does NOT protect a JS-string-in-attribute
   because the parser decodes entities before the JS runs. Never interpolate a
   free-text value into a handler that then assigns it to `innerHTML`.
3. **`wt_api_key` stays out of `SYNC_KEYS`.** The Anthropic key is device-local
   (localStorage only). Adding it back syncs the secret to Supabase and writes
   it into exported backup JSON. There is a comment on the array — leave it.
4. **CDN scripts are version-pinned with `integrity="sha384-…"`.** If you bump
   `@supabase/supabase-js` or `xlsx`, you MUST regenerate the SRI hash for the
   new file in the same change or the script silently fails to load and the app
   breaks. Compute from the exact published file, e.g.
   `openssl dgst -sha384 -binary <file> | openssl base64 -A`. The supabase tag
   points at `dist/umd/supabase.js` (not `.min.js`) on purpose — jsDelivr can't
   give a stable hash for its on-the-fly-minified `.min.js`.
5. **Dropdown values never ride in handlers.** The generic dropdown
   (`showDropdown`/`_ddSelect`) references items **by index** — values can be
   free text (person names). Don't reintroduce `_ddSelect('${it.value}')`.
   Same family: person names in any inline handler need the dual-escape
   (invariant #2), and restored-backup project KEYS are sanitized to
   `[a-z0-9_-]` in `importBackup` because keys are interpolated into handlers
   app-wide.
6. **RLS is the security boundary.** Data is per-user (`auth.uid() = user_id`);
   the baked-in anon key is public and safe *only* because RLS is enforced.
   Don't add tables/queries that bypass it.
