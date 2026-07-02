# PM Workload Tracker

A personal project-management cockpit for a PM ("KME") coordinating their own billable work, a team's deliverables, timesheets, and forward capacity planning — all in **one HTML file** (`index.html`, ~16,600 lines) with no build step, no framework, no tests, no package manager.

- **Live site:** https://jackalope178.github.io/workload-tracker/ (GitHub Pages, `main` branch)
- **Cloud sync:** Supabase project `fkgmgpfbfoadgjllttjd` (config baked into the app)
- **Repo rule:** develop on `main` unless told otherwise; push directly.

**If you change only one habit:** navigate by grepping function names (there are ~500), not by line numbers — they drift. Every subsystem below lists its grep anchors.

## The 30-second mental model

Everything is client-side vanilla JS operating on a handful of arrays in `localStorage` (keys prefixed `wt_`), mirrored to a Supabase key-value table when signed in. Each UI tab is a `render*()` function that rebuilds its panel from state. Mutations go through `save(key, data)`, which writes localStorage and fires `cloudSave()`.

```
state (localStorage wt_*)  ⇄  Supabase user_data (per-user KV of JSON blobs)
        │
        ▼
render*() functions rebuild DOM per tab   ←  user actions mutate state → save() → re-render
```

There are **no frameworks, no package manager, no build step, no tests**. The `package.json` exists only to satisfy the Claude Code web environment — never add dependencies to it. External code comes from three CDNs: `@supabase/supabase-js@2` (sync), `xlsx@0.18.5` (Excel import of BigTime allocations), and Google Fonts (Inter, Syne).

## File map — where things live in `index.html` (~16,600 lines)

Line numbers drift as the file grows; use them as landmarks and confirm with grep.

| Region | Approx. lines | Contents |
|---|---|---|
| CSS | 7–2,730 | One `<style>` block. Themes via `data-theme` attr + CSS variables in `:root`. |
| CDN loads | 2,732–2,741 | Supabase, XLSX (with a fallback CDN retry). |
| HTML body | 2,743–4,081 | Tab bar (`.tabs`, ~line 2,856), six tab panels, all modals (setup, settings, brain-dump, welcome). |
| Sync + auth | 4,082–~4,600 | `_supabase` client, login, `SYNC_KEYS` list, `cloudSave`/`cloudLoad`/`loadFromSupabase`. |
| Core helpers | ~5,100 | `uid()`, `load(key, fallback)`, `save(key, data)`. |
| Tab renderers + logic | ~5,900–16,615 | The bulk of the app; see the tab table below. |

## The six tabs

| Tab | Purpose | Entry function(s) |
|---|---|---|
| **My Tasks** | Personal billable tasks: recurrence, timers, priority, week planner. | `renderTasks()`, `renderWeekPlanner()` |
| **Projects** | Project codes, metadata, members, per-project item lists. | `renderProjects()`, `renderProjCodeList()`, `renderProjCodeContent()` |
| **Team Deliverables** | Cross-team assignments with multi-stage **relay** hand-offs and per-person boards. | `renderTeam()`, `renderTeamBoard()` |
| **Timesheet** | Logged time per project; week view (backward-looking) and month/year view (forward-looking). | `renderTimesheet()`, `renderTsCapacityBar()` |
| **Capacity** | 12-month personal headroom planner: logged + planned vs capacity, drill-down, move/delegate. | `renderCapacity()`, `_renderCapMonthDetail()`, `_renderCapItemList()`, `capMoveItem()`, `capDelegateItem()` |
| **Allocations** | Budgeted vs actual hours per person/project per month (BigTime import). | `renderAllocations()`, `handleAllocImport()` |

Tab switching: `_switchTab(tab)`; active tab persists in `wt_active_tab`.

## Data model

### Primary stores (localStorage, synced via `SYNC_KEYS`)

| Key | Contents |
|---|---|
| `wt_tasks` | Personal task array: `{ id, name, project, subCode, priority, due, est, category, waiting, notes, recurrence, timer, timerStart, completed }` |
| `wt_team` | Team deliverables: `{ id, name, owner, owners[], project, subCode, due, status, waiting, notes }` + relay fields (`relay[]`, `relayStage`, `activeOwner`, `reviewTaskId`, `relayLog[]`) |
| `wt_bigprojs` | Big projects (multi-session/subtask structures) |
| `wt_completed` | Archive of completed items — also the **billing ledger** (Timesheet/Allocations actuals read from here) |
| `wt_projects_meta` | Project definitions: `{ label, color, billingCode, subCodes[], tags[] }` |
| `wt_persons` | Team roster |
| `wt_allocations` | Monthly budget allocations per person/project |

Plus ~20 smaller preference/UI keys (`wt_theme`, `wt_ts_capacity`, collapse states, etc.). Anything that must survive across devices belongs in the `SYNC_KEYS` array (~line 4,451).

### Conventions
- **IDs:** `uid()` = `'_' + Math.random().toString(36).slice(2, 11)`
- **Statuses:** `need-delegate`, `in-progress`, `ready-review`, `in-review`, `blocked`, `complete`
- **Priorities:** `urgent`, `high`, `med`, `low`
- **Billing codes:** `T-21-010`, `W-24-022` style; sub-codes live under projects
- **Internal composite objects** (used by Capacity/planners): `_type` (`task` | `session` | `team`) with `_date`, `_src`, `_delegated`
- **The `'Me'` sentinel:** the app owner is stored as `'Me'` everywhere, displayed as **"KME"** on the Team tab

## The relay / KME flow — read before touching Team, My Tasks mirroring, or billing

The single most interconnected subsystem. A Team deliverable can carry a **relay**: an ordered list of stages (`kind ∈ work | review | send`), each with an assignee, estimate, and due date. When the "baton" reaches a `'Me'` stage, the app creates a **mirror task** in `wt_tasks` so the owner's leg shows up in My Tasks, counts in Capacity, and bills once (never twice) to `wt_completed` on pass or checkbox-complete.

**Full documentation and design-intent log: [`docs/team-relay-and-kme-flow.md`](docs/team-relay-and-kme-flow.md).** It covers the data model, perspective-based status derivation (`relayStatusInfo`), the four subsystem connections, deliberate decisions (one billing code per deliverable, one-way relay→mirror sync, double-count guards), and a chronological intent log of every relay-related ask. Keep that log updated when changing relay behavior.

## Invariants — deliberate design, do NOT "fix"

These look like inconsistencies or bugs but are intentional. Violating them is a regression:

1. **Timesheet week view ≠ month view math.** Week bars = **logged only** vs capacity (backward-looking record). Month/year bars = **logged + planned** vs capacity (forward-looking headroom), with class-based green/yellow/red coloring (`mCls`/`wCls`) that differs from week view's inline color logic. Never unify them.
2. **A KME relay item appears twice by design** — on the team board (using stage `est` via `_relayPersonEst`) and as a My-Tasks mirror (which is what Capacity counts). The two meters are intentionally non-additive; `plannedItems()` excludes `wt_team` items to prevent double-counting.
3. **Checkbox-completing a relay mirror advances the relay with 0 extra hours** — the completion modal already logged them; the 0 prevents double-billing.
4. **Relay stages have no label field** and the `ready-review` + `in-review` statuses share one merged board column (`BOARD_COLS` in `renderTeamBoard`) — removed/merged by design.
5. **Relay → mirror sync is one-way.** Editing the mirror task never updates the relay stage.
6. **One billing code per deliverable.** All relay legs bill to the deliverable's `project`+`subCode`; stages don't carry their own code. Leg hours are quarter-rounded with a 0.25 floor (`roundToQuarter`).
7. **`package.json` is a placeholder** for the Claude Code web environment. Never add dependencies.

## Sync architecture

- `save(key, data)` → localStorage + `cloudSave(key, data)` (upsert into Supabase `user_data`, conflict key `user_id,key`, payload `{ value: <blob> }`).
- On sign-in, `loadFromSupabase()` pulls all keys and overwrites local state.
- Offline / signed-out mode works fully on localStorage; the header shows "Offline".
- Supabase URL/key default to the baked-in project but can be overridden via the settings modal (`wt_supabase_config`).

## Task → grep anchor quick reference

| If the task touches… | Start by grepping… |
|---|---|
| Personal tasks, recurrence, timers | `function renderTasks`, `renderWeekPlanner`, `confirmComplete` |
| Team board, statuses, relay/hand-offs | `renderTeamBoard`, `relayStatusInfo`, `_relaySync`, `relayAdvance` |
| KME mirror tasks / My-Tasks ↔ Team link | `_syncBatonMirror`, `_closeBatonMirror`, `_taskRelayPassBtn`, `_deliverableId` |
| Billing / logged hours | `_logRelayLeg`, `wt_completed`, `roundToQuarter` |
| Timesheet bars & colors | `renderTimesheet`, `renderTsCapacityBar`, `mCls`, `wCls` |
| Capacity planner / drill-down | `renderCapacity`, `plannedItems`, `capMoveItem`, `capDelegateItem`, `_allocHold` |
| Allocations / Excel import | `renderAllocations`, `handleAllocImport` |
| Projects & metadata | `renderProjects`, `renderProjCodeContent`, `wt_projects_meta` |
| Cloud sync / auth | `SYNC_KEYS`, `cloudSave`, `loadFromSupabase` |
| Tabs / navigation | `_switchTab`, `data-tab` |
| Theming | `data-theme`, `:root` |

## Working on this codebase

- **Single-file discipline:** all HTML/CSS/JS changes go in `index.html`. Docs go in `docs/`.
- **Rebuild-from-state pattern:** after mutating state, call the owning tab's `render*()`; don't patch DOM incrementally.
- **New persistent state?** Add the key to `SYNC_KEYS` if it should follow the user across devices; use the `load`/`save` wrappers, never raw `localStorage` calls.
- **Verify by opening `index.html` in a browser** — there is no test suite, linter, or build to run.
- **Touching relay, the My-Tasks mirror, or team-board status?** Read `docs/team-relay-and-kme-flow.md` first and append to its intent log.
- **`CLAUDE.md`** holds operating instructions for AI agents (branch policy, environment notes); this README is the architectural map. Keep both in sync when structure changes.
