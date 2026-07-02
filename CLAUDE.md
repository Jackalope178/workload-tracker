# PM Workload Tracker

GitHub repo: Jackalope178/workload-tracker — push all changes directly to this repo using git push. Develop on main branch unless otherwise specified.

Live site: https://jackalope178.github.io/workload-tracker/
Supabase project: fkgmgpfbfoadgjllttjd (config baked into the app)

## Setup

No build step, no package manager, no dependencies to install. The `package.json` exists only to satisfy the Claude Code on the web environment setup script — do not add dependencies to it.

**Environment setup script** (claude.ai/code environment settings): should be empty or `exit 0`. This project needs no setup.

## Architecture

Single-file app: everything lives in `index.html` (~16,600 lines of inline HTML, CSS, and vanilla JS). No frameworks, no build step, no package manager.

> **Architecture map:** `README.md` is the big-picture orientation doc — file
> regions, tab/function index, invariants, and a task→grep-anchor table. Start
> there before diving into `index.html`.

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

## Conventions
- **IDs**: `uid()` = `'_' + Math.random().toString(36).slice(2, 11)`
- **Statuses**: `need-delegate`, `in-progress`, `ready-review`, `in-review`, `blocked`, `complete`
- **Priorities**: `urgent`, `high`, `med`, `low`
- **Billing codes**: format like `T-21-010`, `W-24-022`
- **Themes**: dark/light via `data-theme` attribute, CSS variables in `:root`
- **Render pattern**: `render*()` functions rebuild UI from state
- **Internal composite objects**: `_type` prefix (`task`, `session`, `team`) with `_date`, `_src`, `_delegated` fields
