# PM Workload Tracker

A personal project-management cockpit for a PM ("KME") coordinating their own billable work, a team's deliverables, timesheets, and forward capacity planning — all in **one HTML file** (`index.html`, ~16,900 lines) with no build step, no framework, no tests, no package manager.

- **Live site:** https://jackalope178.github.io/workload-tracker/ (GitHub Pages, `main` branch)
- **Cloud sync:** Supabase project `cgxqwgdtgxzegneasocx` (user-owned; config baked into the app)
- **Repo rule:** develop on `main` unless told otherwise; push directly.

**If you change only one habit:** navigate by grepping function names (there are ~525), not by line numbers — they drift. Every subsystem below lists its grep anchors.

## The 30-second mental model

Everything is client-side vanilla JS operating on a handful of arrays in `localStorage` (keys prefixed `wt_`), mirrored to a Supabase key-value table when signed in. Each UI tab is a `render*()` function that rebuilds its panel from state. Mutations go through `save(key, data)`, which writes localStorage and fires `cloudSave()`.

```
state (localStorage wt_*)  ⇄  Supabase user_data (per-user KV of JSON blobs)
        │
        ▼
render*() functions rebuild DOM per tab   ←  user actions mutate state → save() → re-render
```

There are **no frameworks, no package manager, no build step, no tests**. The `package.json` exists only to satisfy the Claude Code web environment — never add dependencies to it. External code comes from three CDNs: `@supabase/supabase-js@2` (sync), `xlsx@0.18.5` (Excel import of BigTime allocations), and Google Fonts (Inter, Syne).

## File map — where things live in `index.html` (~16,900 lines)

Line numbers drift as the file grows; use them as landmarks and confirm with grep.

| Region | Approx. lines | Contents |
|---|---|---|
| CSS | 7–2,730 | One `<style>` block. Light-only theme (dark retired July 2026): permanent `data-theme="light"` over dark `:root` base variables. |
| CDN loads | 2,732–2,741 | Supabase, XLSX (with a fallback CDN retry). |
| HTML body | 2,743–4,081 | Tab bar (`.tabs`, ~line 2,856), six tab panels, all modals (setup, settings, brain-dump, welcome). |
| Sync + auth | 4,082–~4,600 | `_supabase` client, login, `SYNC_KEYS` list, `cloudSave`/`cloudLoad`/`loadFromSupabase`. |
| Core helpers | ~5,100 | `uid()`, `load(key, fallback)`, `save(key, data)`. |
| Tab renderers + logic | ~5,900–end | The bulk of the app; see the tab table below. |

## The six tabs

| Tab | Purpose | Entry function(s) |
|---|---|---|
| **My Tasks** | Personal billable tasks: recurrence, timers, priority, week planner. | `renderTasks()`, `renderWeekPlanner()` |
| **Projects** | Opens on **▦ Boards**: one sticky-note whiteboard per sub-code plus a 💭 Loose thoughts board (free-arrange or ⊞ Sort 2×2 urgent/important view; stickies carry no hours). **☰ List** is the per-sub-code ledger of tasks, sessions, subtasks and deliverables. | `renderProjects()`, `renderProjBoards()`, `renderProjCodeContent()` |
| **Team Deliverables** | Cross-team assignments with multi-stage **relay** hand-offs and per-person boards. | `renderTeam()`, `renderTeamBoard()` |
| **Timesheet** | Logged time per project; pay-period view (backward-looking) and month/year view (forward-looking). Spreadsheet reconciliation via **⬆ Import & Audit**. | `renderTimesheet()`, `renderTsCapacityBar()`, `handleTsAuditImport()` |
| **Capacity** | 12-month personal headroom planner: logged + planned vs capacity, drill-down, move/delegate. | `renderCapacity()`, `_renderCapMonthDetail()`, `_renderCapItemList()`, `capMoveItem()`, `capDelegateItem()` |
| **Allocations** | Budgeted vs actual hours per project/sub-code per month (BigTime import). | `renderAllocations()`, `handleAllocImport()` |

Tab switching: `_switchTab(tab)`; active tab persists in `wt_active_tab`.

## Data model

### Primary stores (localStorage, synced via `SYNC_KEYS`)

| Key | Contents |
|---|---|
| `wt_tasks` | Personal task array: `{ id, name, project, subCode, priority, due, est, category, notes, recurrence, timer, timerStart, completed }`. **`waiting` retired (Sep 2026)** — legacy values fold into `notes` at init (`⏳ `-prefixed) and notes render inline on the task row in the old waiting-chip yellow. Delegation fields: `delegatedTo[]` (lightweight tag — renders on the Team tab, leaves your Capacity) and `_deliverableId` (the task is a relay-mirror leg of that `wt_team` item). |
| `wt_team` | Team deliverables: `{ id, name, owner, owners[], project, subCode, due, status, waiting, notes }` + relay fields (`relay[]`, `relayStage`, `activeOwner`, `reviewTaskId`, `relayLog[]`) |
| `wt_bigprojs` | Big projects (multi-session/subtask structures) |
| `wt_completed` | Archive of completed items — also the **billing ledger** (Timesheet/Allocations actuals read from here). Entries carry provenance when something else billed them: `_blockRef` (work block), `_srcRef` (session/subtask), `_tsaRef` (timesheet audit import) |
| `wt_projects_meta` | Project definitions: `{ label, color, billingCode, subCodes[], tags[] }` |
| `wt_persons` | Team roster |
| `wt_allocations` | Monthly budget allocations per person/project |
| `wt_boards` | Whiteboards, one per sub-code plus the project's 💭 Loose thoughts board: `{ id, projKey, scId, createdAt }` |
| `wt_board_cards` | Stickies: `{ id, boardId, kind: note \| heading \| ref \| meeting, x, y, w, h, color, z, text, urgent, important, createdAt, updatedAt }` — no hours. `ref` cards link to a task/deliverable/work item and resolve it live (nothing copied); `meeting` cards carry a `date` and an http(s) `url` |

Plus ~20 smaller preference/UI keys (`wt_theme`, `wt_ts_capacity`, collapse states, etc.). Anything that must survive across devices belongs in the `SYNC_KEYS` array (~line 4,451).

### Conventions
- **IDs:** `uid()` = `'_' + Math.random().toString(36).slice(2, 11)`
- **Statuses:** `need-delegate`, `in-progress`, `ready-review`, `in-review`, `blocked`, `complete`
- **Priorities:** `urgent`, `high`, `med`, `low` (+ `meeting` in My Tasks — meeting items route to the board's Meetings column)
- **Billing codes:** `T-21-010`, `W-24-022` style; sub-codes live under projects
- **Internal composite objects** (used by Capacity/planners): `_type` (`task` | `session` | `team`) with `_date`, `_src`, `_delegated`, `_taskDelegated`. The Team tab builds composite rows for delegated tasks/sessions/subtasks — any field the board/list/chips read (`notes`, `est`, `priority`, …) must be copied into those composites in `renderTeam()` or it silently vanishes there.
- **The `'Me'` sentinel:** the app owner is stored as `'Me'` everywhere, displayed as **"KME"** on the Team tab

## The relay / KME flow — read before touching Team, My Tasks mirroring, or billing

The single most interconnected subsystem. A Team deliverable can carry a **relay**: an ordered list of stages (`kind ∈ work | review | send`), each with an assignee, estimate, and due date. When the "baton" reaches a `'Me'` stage, the app creates a **mirror task** in `wt_tasks` so the owner's leg shows up in My Tasks, counts in Capacity, and bills once (never twice) to `wt_completed` on pass or checkbox-complete.

The bridge runs both ways: **⇄ Hand off as deliverable** (task and work-item edit modals) converts a personal item INTO a `wt_team` relay pre-seeded `Work — <person>` → `Review — Me`, deleting the source so the hours have exactly one home (invariant 8 below).

**Mirror lifecycle rules:** every path that completes or deletes a deliverable closes/removes its Me-leg mirror; completing a non-relay baton mirror stamps `ownerStatus['Me']` on the deliverable; and `_auditBatonMirrors()` self-heals any drift at every app init (missing mirrors re-created, stale mirrors closed, with a "Baton sync" toast). A new complete/delete path for team items must call `_closeBatonMirror`.

**Full documentation and design-intent log: [`docs/team-relay-and-kme-flow.md`](docs/team-relay-and-kme-flow.md).** It covers the data model, perspective-based status derivation (`relayStatusInfo`), the four subsystem connections, deliberate decisions (one billing code per deliverable, one-way relay→mirror sync, double-count guards), and a chronological intent log of every relay-related ask. Keep that log updated when changing relay behavior.

## Invariants — deliberate design, do NOT "fix"

These look like inconsistencies or bugs but are intentional. Violating them is a regression:

1. **Timesheet pay-period view ≠ month view math.** Period bars = **logged only** vs capacity (backward-looking record). Month/year bars = **logged + planned** vs capacity (forward-looking headroom), with class-based green/yellow/red coloring (`mCls`/`wCls`) that differs from period view's inline color logic. Never unify them.
2. **A KME relay item appears twice by design** — on the team board (using stage `est` via `_relayPersonEst`) and as a My-Tasks mirror (which is what Capacity counts). The two meters are intentionally non-additive; `plannedItems()` excludes `wt_team` items to prevent double-counting — except **future Me legs of in-flight relays**, which emit synthetic `_relayFuture` entries so upcoming review/send time holds its dates in Capacity; the mirror takes over (and the synthetic entry retires) as each leg becomes current. The My Tasks list shows the same dated future legs as grey read-only ◖ rows naming who currently holds the baton — click one to open the deliverable.
3. **Checkbox-completing a relay mirror advances the relay with 0 extra hours** — the completion modal already logged them; the 0 prevents double-billing.
4. **Relay stages have no label field** and the `ready-review` + `in-review` statuses share one merged board column (`BOARD_COLS` in `renderTeamBoard`) — removed/merged by design.
5. **Relay → mirror sync is one-way.** Editing the mirror task never updates the relay stage — so opening a mirror for editing redirects to the **deliverable** editor, and the mirror's Pass → chip renders only when a next stage exists (final leg: the ✓ checkbox logs and closes the relay; pass affordances relabel to "✓ Finish").
6. **One billing code per deliverable.** All relay legs bill to the deliverable's `project`+`subCode`; stages don't carry their own code. Leg hours are quarter-rounded with a 0.25 floor (`roundToQuarter`) — but **zero always means "bill nothing"**: the completion modal and `_logRelayLeg` never clamp a typed 0 up to 0.25. Closing a work block at 0h cancels it (no ledger entry); closing a task at 0h keeps everything its blocks logged and archives a 0h row.
7. **`package.json` is a placeholder** for the Claude Code web environment. Never add dependencies.
8. **Hand-off moves hours exactly once.** Converting a task/session/subtask into a deliverable deletes the source item; a handed-off subtask's hours are subtracted from its parent session's total; done work blocks / done subtasks stay out of the deliverable's est (already billed); sessions with open subtasks refuse; recurring items never convert (use the `delegatedTo` tag instead).
9. **Meetings are priority-routed and status-less on the board.** Meeting-priority cards live in the Meetings column and render no status badge while active; the Blocked column is folded into In Progress (🚫 badge) and the person cockpit has no Blocked chip — the toolbar status filter isolates blocked.
10. **Person-board solo cards show no baton line** ("Solo" without "◖ X's turn" on X's own board), and board view preferences (`wt_team_view`, `wt_team_board_person`, `wt_team_board_sort` — project-grouped vs nearest-due flat — and the Projects tab's ✓ Completed toggle, `wt_proj_show_completed`) are device-local, never synced. The board is always a **person's** view (the 👥 Everyone board was retired Aug 2026 — the list view is the neutral reading), and **+ Add Deliverable from a person's board pre-selects that person as owner**.
11. **Work blocks bill exactly once and stay locked.** A logged block's ledger entry is linked to it (`_blockRef` on the entry, `entryId` on the block); un-ticking a done block retracts the entry (with undo) so hours are never logged and planned at once. Done blocks' hours are frozen on task save; a task with logged blocks refuses to become recurring. Every ▣ block row (Timesheet, Capacity drill-down, week planner, task lists) logs/moves **its block**, never the parent task; closing a parent with open blocks warns that they're cancelled unbilled. Sessions and subtasks follow the same lock-in (`_srcRef`/`entryId`): un-ticking retracts the entry, and a done block/subtask can't be deleted until it's un-ticked (deletion would re-grow the parent's remainder while the hours stay billed).
12. **A co-assigned item (`delegatedTo` includes `'Me'` plus others) stays on My Tasks and in Capacity** — only items delegated entirely to others leave. Assignment toggles toast the outcome (`_assignToast`); the dropdown stays open for multi-select, so the toast is the primary feedback.
13. **Recurring anchors only move along natural occurrence dates** (see [`docs/recurrence-audit-2026-08.md`](docs/recurrence-audit-2026-08.md)). One-off moves live in `recurrence.overrides`, one-off cancels in `recurrence.skips` — both keyed by the ORIGINAL occurrence date. A missed backlog resolves via **⏩ Catch up** (`catchUpRecurrence` — records skips, resumes on schedule, undoable); the edit modal's due field shows the next upcoming occurrence but writes it back only when actually changed. Month moves and drag-assigns refuse dated recurring items (task occurrence rows reroute to 📅 reschedule); recurring **month holds** (no date) are the exception — moving one re-parks the month the hold series starts.
14. **The task modal is compact by design** (Sep 2026). Core fields only (name, project/sub-code, priority, due, est, notes); scheduling (work date / spread / work blocks / hold month), recurrence, and team options (assign-to / hand-off) live behind 📅 🔁 👥 toggle buttons. Collapsing hides fields without clearing them, and each button summarizes anything set inside. Tasks carry **no Waiting On field** — notes are the one free-text field and show inline on the row; the board's ⏳ Waiting chip counts only true `waiting` on team/session items.
15. **The timesheet audit import compares bucket totals, never rows.** `⬆ Import & Audit` on the Timesheet tab reconciles a source-of-truth spreadsheet against `wt_completed` by **project + sub-code + date**, summing each side — the tracker may hold several entries against one code on one day where the sheet holds one line. The comparison is **windowed to the sheet's own date range**; **under-logged days default to apply, over-logged and sheet-absent days default to skip** (removing billed time is always explicit); an entry locked to a completed block or session (`_blockRef`/`_srcRef`) is never edited or deleted — un-tick it at source; and because totals are compared, **re-importing the same sheet is a no-op**, not a double-count. It shares the allocations import's matching layer and alias memory, so a remap taught in one holds in the other. **Granularity follows what the sheet asserts:** a BigTime *Timesheet Detail* export leaves its `Category` column empty, so when no sub-code data is present the comparison drops to **project level** rather than flagging every row. Totals footers are skipped silently; a sheet naming several staff defaults to one person (never importing a colleague's hours silently); non-chargeable lines are included by default but toggleable.
16. **Boards are a thinking surface, not a planner** (Sep 2026, Phase 0 of [`docs/vision-2026-09-boards.md`](docs/vision-2026-09-boards.md)). Stickies never carry hours or dates and are invisible to Capacity, the Timesheet and Allocations — a thought becomes work only by becoming a task. Capture is one field + Enter; the board strip never hides a board; the ⊞ Sort 2×2 view keeps unsorted stickies in a visible tray; quadrant labels are verbs (Do now / Schedule / Delegate / Park). The save-state chip on every board (synced / saved on this device / failed) is deliberate friction after the Aug 2026 data-loss incident. Board view prefs (`wt_proj_view`, `wt_board_open`, `wt_board_view`) are device-local. **A sticky becomes work only by promotion** (⋯ → Make this a task, or ✂ Task from selection on a meeting card): the task lands in the Inbox with no date or estimate, priority seeded from its 2×2 box (the Delegate box opens the Team section first), and the card becomes a **live linked card** that never copies fields — a deleted item leaves a dashed card you can unlink back into a sticky. 📌 pins existing items to their board (no duplicates); headings roll up the linked cards stacked beneath them spatially; tasks remember their sticky (💭).

## Sync architecture

- `save(key, data)` → localStorage + a per-key timestamp + `cloudSave(key, data)` (upsert into Supabase `user_data`, conflict key `user_id,key`, payload `{ value: <blob> }`).
- **Sign-in is a per-key timestamped merge, not an overwrite:** cloud wins only when its copy is newer; local-newer keys are pushed up right after the pull, and a reconnect listener flushes pending changes when the browser comes back online.
- An **account-switch guard** (`_syncGuardUser`) keeps one account's local data from shadowing another's cloud data: on a switch it stashes a device-local snapshot (`wt_local_snapshot`) and lets the cloud win. `wt_last_user` / `wt_local_snapshot` / `_ts_*` are device-local — never in `SYNC_KEYS`.
- Offline / signed-out mode works fully on localStorage; the header shows "Offline" and a persistent red banner warns that nothing is backed up (click it to sign in).
- Supabase URL/key default to the baked-in project but can be overridden via the settings modal (`wt_supabase_config`).

## Task → grep anchor quick reference

| If the task touches… | Start by grepping… |
|---|---|
| Personal tasks, recurrence, timers | `function renderTasks`, `renderWeekPlanner`, `confirmComplete` |
| Per-occurrence recurrence actions (skip/move/catch-up) | `skipRecurOccurrence`, `openRescheduleModal`, `catchUpRecurrence`, `_recurMissedDates` |
| Team board, statuses, relay/hand-offs | `renderTeamBoard`, `relayStatusInfo`, `_relaySync`, `relayAdvance` |
| KME mirror tasks / My-Tasks ↔ Team link | `_syncBatonMirror`, `_closeBatonMirror`, `_taskRelayPassBtn`, `_deliverableId` |
| Task/session → deliverable hand-off (delegation) | `_handoffCreateDeliverable`, `handoffTaskAsDeliverable`, `handoffSessionAsDeliverable`, `delegatedTo`, `capDelegateItem` |
| Billing / logged hours | `_logRelayLeg`, `wt_completed`, `roundToQuarter` |
| Timesheet bars & colors | `renderTimesheet`, `renderTsCapacityBar`, `mCls`, `wCls` |
| Capacity planner / drill-down | `renderCapacity`, `plannedItems`, `capMoveItem`, `capDelegateItem`, `_allocHold` |
| Allocations / Excel import | `renderAllocations`, `handleAllocImport` |
| Timesheet audit import (spreadsheet ↔ ledger) | `handleTsAuditImport`, `_buildTsAuditPlan`, `_tsaComputeGroups`, `_tsaActiveRows`, `_commitTsAuditPlan`, `_tsaEntryLocked` |
| Reconcile view (plan vs budget) | `_renderAllocReconcile`, `_allocProjMonthTotals`, `_allocReconShift` |
| Projects & metadata | `renderProjects`, `renderProjCodeContent`, `wt_projects_meta` |
| Boards / stickies / 2×2 sort | `renderProjBoards`, `boardAddCard`, `boardCardEdit`, `_boardSetQuadrant`, `boardSlide`, `_boardSave`, `wt_boards`, `wt_board_cards` |
| Linked cards / promote / pin / meeting cards | `boardPromoteCard`, `_boardTaskFromSelection`, `boardPinItem`, `_boardRefResolve`, `_boardHeadingRollup`, `boardAddMeeting`, `boardRevealCard` |
| Cloud sync / auth | `SYNC_KEYS`, `cloudSave`, `loadFromSupabase` |
| Tabs / navigation | `_switchTab`, `data-tab` |
| Theming (light-only) | `applyTheme`, `data-theme`, `:root` |
| Person pill colors | `personColor`, `wt_person_colors` |

## Working on this codebase

- **Single-file discipline:** all HTML/CSS/JS changes go in `index.html`. Docs go in `docs/`.
- **Rebuild-from-state pattern:** after mutating state, call the owning tab's `render*()`; don't patch DOM incrementally.
- **New persistent state?** Add the key to `SYNC_KEYS` if it should follow the user across devices; use the `load`/`save` wrappers, never raw `localStorage` calls.
- **Run the invariant suite before shipping:** `.claude/skills/verify/run.sh` drives the app in headless Chromium and asserts the documented invariants (math, relay billing, hand-off, board rules, XSS escaping). Add a scenario when you add an invariant. For headless end-to-end checks, `.claude/skills/verify/SKILL.md` records a working Playwright + Chromium recipe (seed `wt_*` localStorage — JSON-encode string values, `load()` JSON-parses — then drive the real UI).
- **Touching any calculation?** Read `docs/math-audit-2026-07.md` first — it records the July 2026 audit's findings, fixes, and the invariants they established.
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
- **SOP — keep the in-app orientation current:** feature work isn't done until the ⓘ popover copy (`INFO_COPY`), the welcome tour (`welcomeOverlay` + `_WELCOME_STEPS`), and the per-tab help panel (`_TAB_TIPS`) reflect the change.
- **Touching relay, the My-Tasks mirror, or team-board status?** Read `docs/team-relay-and-kme-flow.md` first and append to its intent log.
- **`CLAUDE.md`** holds operating instructions for AI agents (branch policy, environment notes); this README is the architectural map. **Updating them is part of the change, in the same commit:** a new invariant, deliberate quirk, SOP, data-model field, preference key, or entry point goes into CLAUDE.md (anchor table / invariants lists) with the substance mirrored here. Docs that describe the previous version of the app are a bug.
