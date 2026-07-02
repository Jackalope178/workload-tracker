# PM Workload Tracker

GitHub repo: Jackalope178/workload-tracker — push all changes directly to this repo using git push. Develop on main branch unless otherwise specified.

Live site: https://jackalope178.github.io/workload-tracker/
Supabase project: fkgmgpfbfoadgjllttjd (config baked into the app)

## Setup

No build step, no package manager, no dependencies to install. The `package.json` exists only to satisfy the Claude Code on the web environment setup script — do not add dependencies to it.

**Environment setup script** (claude.ai/code environment settings): should be empty or `exit 0`. This project needs no setup.

## Architecture

Single-file app: everything lives in `index.html` (~9800 lines of inline HTML, CSS, and vanilla JS). No frameworks, no build step, no package manager.

> **Team relay & KME flow:** the multi-stage pass-around on Team Deliverables,
> and how the owner's ("KME"/`'Me'`) legs tie into My Tasks / Capacity /
> billing, are documented in `docs/team-relay-and-kme-flow.md` — read it before
> touching relay, the My-Tasks mirror, or team-board status. It also carries the
> running intent log of relay asks.

### External CDN dependencies
- `@supabase/supabase-js@2` — cloud sync
- `xlsx@0.18.5` — Excel import
- Google Fonts (Inter, Syne)

### Storage
- **localStorage** with `wt_` prefix for all keys
- **Supabase** `user_data` table (key-value store syncing serialized JSON blobs)
- `load(key, fallback)` / `save(key, data)` wrappers handle localStorage + trigger `cloudSave()`

## App Tabs
1. **My Tasks** — personal tasks with recurrence, timers, priority
2. **Projects** — browse/manage project codes and metadata
3. **Team Deliverables** — cross-team task assignments with ownership and status
4. **Timesheet** — time entries per project, actual vs estimated hours
5. **Capacity** — forward-looking 12-month personal workload planner (logged + planned vs capacity)
6. **Allocations** — monthly workload allocation per person/project (budget tracking)

## Key Data Structures

### localStorage keys
- `wt_tasks` — personal task array
- `wt_team` — team deliverables array
- `wt_bigprojs` — big projects (multi-session/subtask structures)
- `wt_completed` — archive of completed items
- `wt_projects_meta` — project definitions (label, color, billingCode, subCodes, tags)
- `wt_persons` — team member list
- `wt_allocations` — monthly capacity allocations

### Task object
`{ id, name, project, subCode, priority, due, est, category, waiting, notes, recurrence, timer, timerStart, completed }`

### Team item object
`{ id, name, owner, owners[], project, subCode, due, status, waiting, notes }`

### Project metadata
`{ label, color, billingCode, subCodes[], tags[] }`

## Capacity Meter Design Intent

### How the two Timesheet views differ — DO NOT "fix" this
- **Week view** (Timesheet default): Bars show **logged hours only** vs capacity. This is a backward-looking record of time spent. Status = logged / capacity.
- **Month view** (Timesheet year view): Bars show **logged + planned combined** vs capacity. This is forward-looking — it answers "do I have room for more work?" Status = (logged + planned) / capacity. The class-based coloring (green/yellow/red via `mCls`/`wCls`) is intentional here and different from week view's inline color logic.

These are intentionally different metrics. Do not unify them.

### Capacity Tab
A dedicated main tab called **Capacity** for forward-looking workload planning:
- Shows 12-month capacity meters (logged + planned vs total capacity per month)
- Answers the question: "Someone says we need this done by May — do I have time?"
- Click into a month → high-level breakdown by parent project billing code, showing hours allocated/planned per code
- Click on a parent project → drill-down to see individual planned items (recurring tasks, sessions, holds)
- From drill-down, user can: edit task dates, move items to a different alloc month, delegate items to free up capacity
- All recurrences should be expanded so the user sees true future load
- This is distinct from the existing Allocations tab (which tracks budgeted vs actual by project). Capacity is about personal workload headroom.
- Key functions: `renderCapacity()`, `_renderCapMonthDetail()`, `_renderCapItemList()`, `capMoveItem()`, `capDelegateItem()`

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

## Conventions
- **IDs**: `uid()` = `'_' + Math.random().toString(36).slice(2, 11)`
- **Statuses**: `need-delegate`, `in-progress`, `ready-review`, `in-review`, `blocked`, `complete`
- **Priorities**: `urgent`, `high`, `med`, `low`
- **Billing codes**: format like `T-21-010`, `W-24-022`
- **Themes**: dark/light via `data-theme` attribute, CSS variables in `:root`
- **Render pattern**: `render*()` functions rebuild UI from state
- **Internal composite objects**: `_type` prefix (`task`, `session`, `team`) with `_date`, `_src`, `_delegated` fields
