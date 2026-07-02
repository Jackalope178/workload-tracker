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

**Verify by opening `index.html` in a browser** — there is no test suite,
linter, or build to run. For pure calculation changes, extracting the touched
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

External code comes from three CDNs: `@supabase/supabase-js@2` (sync),
`xlsx@0.18.5` (BigTime Excel import, with a fallback CDN retry), and Google
Fonts (Inter, Syne).

## File map — where things live in `index.html` (~16,700 lines)

Line numbers drift as the file grows; use them as landmarks and confirm with grep.

| Region | Approx. lines | Contents |
|---|---|---|
| CSS | 7–2,730 | One `<style>` block. Themes via `data-theme` attr + CSS variables in `:root`. |
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
| `wt_tasks` | Personal tasks: `{ id, name, project, subCode, priority, due, est, category, waiting, notes, recurrence, timer, timerStart, completed }` |
| `wt_team` | Team deliverables: `{ id, name, owner, owners[], project, subCode, due, status, waiting, notes }` + relay fields (`relay[]`, `relayStage`, `activeOwner`, `reviewTaskId`, `relayLog[]`) |
| `wt_bigprojs` | Big projects (multi-session/subtask structures) |
| `wt_completed` | Archive of completed items — also the **billing ledger** (Timesheet/Allocations actuals read from here) |
| `wt_projects_meta` | Project definitions: `{ label, color, billingCode, subCodes[], tags[] }` |
| `wt_persons` | Team roster |
| `wt_allocations` | Monthly budget allocations, keyed `projKey|scId|YYYY-MM` |

Plus ~20 smaller preference/UI keys (`wt_theme`, `wt_ts_capacity`, collapse
states, …). Anything that must survive across devices belongs in `SYNC_KEYS`.

### Conventions
- **IDs:** `uid()` = `'_' + Math.random().toString(36).slice(2, 11)`
- **Statuses:** `need-delegate`, `in-progress`, `ready-review`, `in-review`, `blocked`, `complete`
- **Priorities:** `urgent`, `high`, `med`, `low` (+ `meeting` in My Tasks)
- **Billing codes:** `T-21-010`, `W-24-022` style; sub-codes live under projects
- **Internal composite objects** (used by planners): `_type` (`task` | `session` | `team`) with `_date`, `_src`, `_delegated`
- **The `'Me'` sentinel:** the app owner is stored as `'Me'` everywhere, displayed as **"KME"** on the Team tab
- **Render pattern:** after mutating state, call the owning tab's `render*()`; don't patch DOM incrementally

## The relay / KME flow — read before touching Team, My Tasks mirroring, or billing

The single most interconnected subsystem. A Team deliverable can carry a
**relay**: an ordered list of stages (`kind ∈ work | review | send`), each
with an assignee, estimate, and due date. When the baton reaches a `'Me'`
stage, the app creates a **mirror task** in `wt_tasks` so the owner's leg
shows in My Tasks, counts in Capacity, and bills once (never twice) to
`wt_completed` on pass or checkbox-complete.

**Full documentation and design-intent log: `docs/team-relay-and-kme-flow.md`.**
Keep its intent log updated when changing relay behavior.

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
   `nextRecurrenceAfter` and filter skips themselves.
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
4. **Billing is quarter-hours.** `enforceQuarter` guards every saved hours
   value. `roundToQuarter` has a 0.25 FLOOR — never use it on a
   possibly-zero quantity (use `snapQuarter` clamped at 0, as
   `packIntoFreeDays` does).
5. **Cockpit gauge = remaining relay legs** (`_relayPersonRemainingEst`,
   stages at/after the baton — the meter drains as legs complete); card
   badges show the person's total (`_relayPersonEst`). Don't unify them.
6. **Timesheet month-view week rows use the true Sun–Sat week** for logged,
   planned, AND capacity. Boundary weeks intentionally pull from the adjacent
   month and appear under both months — week bars don't sum to the month bar.

Known-open minor items (deliberate — see the audit's Minor section): rounded
percent color thresholds hide sub-0.5% overruns; `fmtQ` snaps legacy
non-quarter values for display only (sums use raw values); an import merging
a negative rollover can store a ≤0 allocation; `capMoveItem` targets the 15th
even when it falls on a weekend.

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
| Team board, statuses, relay/hand-offs | `renderTeamBoard`, `relayStatusInfo`, `_relaySync`, `relayAdvance` |
| KME mirror tasks / My-Tasks ↔ Team link | `_syncBatonMirror`, `_closeBatonMirror`, `_taskRelayPassBtn`, `_deliverableId` |
| Billing / logged hours | `_logRelayLeg`, `wt_completed`, `roundToQuarter`, `enforceQuarter` |
| Timesheet bars & colors | `renderTimesheet`, `renderTsCapacityBar`, `mCls`, `wCls`, `payPeriodOf` |
| Capacity planner / drill-down / scheduler | `renderCapacity`, `plannedItems`, `capMoveItem`, `capDelegateItem`, `_allocHold`, `_capAssignOne` |
| Allocations / Excel import / rollovers | `renderAllocations`, `handleAllocImport`, `allocKey`, `_rollRemainingForward` |
| Reconcile view (plan vs budget, one month) | `_renderAllocReconcile`, `_allocProjMonthTotals`, `_allocReconShift` |
| Projects & metadata | `renderProjects`, `renderProjCodeContent`, `wt_projects_meta` |
| Cloud sync / auth | `SYNC_KEYS`, `cloudSave`, `loadFromSupabase` |
| Tabs / navigation | `_switchTab`, `data-tab` |
| Theming | `data-theme`, `:root` |

## Working on this codebase

- **Single-file discipline:** all HTML/CSS/JS changes go in `index.html`. Docs go in `docs/`.
- **`README.md` is the human-facing mirror of this file** (for GitHub
  visitors). When structure changes here, keep it in sync.
- **New persistent state?** Add the key to `SYNC_KEYS` if it should follow the
  user across devices; use the `load`/`save` wrappers, never raw `localStorage`.
- **Touching relay, the My-Tasks mirror, or team-board status?** Read
  `docs/team-relay-and-kme-flow.md` first and append to its intent log.
- **Touching any calculation?** Read `docs/math-audit-2026-07.md` first and
  preserve the invariants above.
