# Math & Calculations Audit — July 2026

Full-app audit of date math, recurrence expansion, capacity/planned-hours
aggregation, timesheet totals, allocations/rollovers, billing rounding, and
timer math. Line numbers reference `index.html` at commit `451fae7`.

Findings are ranked by severity. Items 1–2 were verified by executable
simulation of the exact code paths; the rest were verified by tracing every
caller.

---

## Critical

### 1. Recurrence engine stalls on "Monthly on a date" + weekday-adjust → phantom hours explosion
`nextRecurrenceAfter` (`index.html:5616`) for `monthly-date` with
`weekdayAdjust` can return a date **≤ `from`**: when the target day of the
next month falls on a weekend, `adjustToWeekday` pulls it back — for
`dayOfMonth: 1` or `2` it lands on the **previous month's Friday**, i.e. at or
before the date we advanced from. The sequence then never advances.

Verified simulation (task due 2026-02-02, "1st monthly (wkday)", est 2h;
Mar 1 2026 is a Sunday): `nextRecurrenceAfter('2026-02-27')` returns
`2026-02-27` forever. Consequences:

- `plannedItems` (`:10241–10251`): the fast-forward loop burns its full 2000
  iterations, then the expansion loop pushes **1000 duplicate occurrences** —
  the 2h task contributed **2000 planned hours to March 2026** in the
  simulation, and the same 1000 duplicates poison *every* month window after
  the stall date (they're dated outside the window but still summed — see
  finding 4). This corrupts Capacity, Timesheet month bars, Allocations
  planned, `_monthBookedPct`, packers, and pickers.
- `renderTasks` occurrence expansion (`:6128`): 200 duplicate rows (safety cap).
- `_nextUpcomingRecurrence` (`:5584`): spins 2000 iterations, returns a stale
  past date.

Trigger condition: any `monthly-date` recurrence with `weekdayAdjust` and
`dayOfMonth` 1–2 (day 1: whenever the 1st of a month is Sat/Sun — several
times a year).

Fix direction: in `nextRecurrenceAfter`, if the adjusted result is `<= fromDateStr`,
advance to the following month and recompute (loop like the `monthly-weekday`
branch). Also make every expansion loop defensively break when
`next <= cursor`.

### 2. Simple "Monthly" recurrence drifts at month end
`nextRecurrenceAfter` type `monthly` (`:5611`) uses `d.setMonth(d.getMonth()+1)`.
JS date overflow: **Jan 31 → Mar 3** (February is skipped entirely and the
anchor permanently drifts to the 3rd); Mar 31 → May 1; Aug 31 → Oct 1.
Verified by simulation: `2026-01-31 → 03-03 → 04-03 → 05-03 …`

Any monthly task anchored on the 29th–31st silently loses occurrences and
shifts its day-of-month. Fix: clamp to the last day of the target month
(compute `min(anchorDay, daysInTargetMonth)` like the `monthly-date` branch),
or convert `monthly` to `monthly-date` semantics internally.

### 3. Tasks due on the current week's Saturday vanish from the My Tasks list view
Bucketing in `renderTasks` (`:6232–6246`) routes items to: overdue (`< today`),
today, Mon–Fri day buckets (`currentWeekDays`), or future weeks (`> wkEnd`).
A date **equal to `wkEnd`** (this week's Saturday, with Sunday-based weeks)
matches none of the branches and is silently dropped — the task appears
nowhere in list view until it rolls into Overdue next week. (Week-planner view
shows it in the weekend footer, so the two views disagree.)

Fix: route `d <= wkEnd && !currentWeekDays.includes(d)` weekend items into a
current-week weekend bucket (or the nearest day/future bucket).

---

## High

### 4. `plannedItems` callers sum items dated outside the queried window; rescheduled occurrences count in the wrong month
Two related defects:

- **Window vs. display date**: recurring expansion windows by the *original*
  occurrence date but emits `date: overrides[d] || d` (`:10247–10248`). An
  occurrence rescheduled across a month/pay-period boundary keeps counting in
  its **original** month's totals and is absent from the month it was moved to.
- **No re-filtering by callers**: `renderCapacity` (`:11266`), Timesheet month
  bars (`:10822`), `allocGetPlanned` (`:12339`), `_monthBookedPct` (`:14616`)
  etc. sum *all* returned items without checking `p.date` is in range, so any
  out-of-window date emitted by the function (overrides today; finding 1
  duplicates) lands in the wrong bucket. Day-keyed consumers
  (`renderWeekPlanner`, `_renderSchedCalendar`) silently drop them instead —
  so the month bar and its day breakdown disagree.

Fix: emit occurrences windowed by their *effective* (override) date, and/or
have aggregate callers filter `p.date >= from && p.date <= to` (holds
excepted, since their `-15` date is a placeholder).

### 5. Moving items between months leaves a stale `workDate` → hours don't actually move
Placement everywhere is `workDate || due` (`_expandPlanned:10184`), but:

- `capMoveItem` (`:12161`) sets `due = newMonth-15` and `allocMonth`, never
  touching `workDate`. For an item with a work date, the toast says
  "Moved to 2026-09" while its hours stay planned on the old `workDate`
  (and `allocMonth` now disagrees with placement).
- `_projCapDropAssign` (`:7953`) writes `t.due = dateStr` directly instead of
  `_applyWorkPick`, same stale-`workDate` result.

Contrast: `capParkHolds` (`:11119`) and `_capAssignOne` (`:11078`) handle
`workDate` correctly. Fix: clear or re-derive `workDate` in both functions
(or route through `_applyWorkPick`).

### 6. Rollover math for the project-level ('' sub-code) bucket is inconsistent and wrong
Three different definitions of "actual" for the same bucket:

- `_rollRemainingForward` (`:12377`): `scId ? allocGetActuals(...) :
  allocGetAllProjectActuals(...)` — for the `''` bucket it subtracts **all**
  project actuals including hours already attributed to real sub-codes
  (double-counted against their own buckets when those roll).
- `_rollProjectAllSubsForward` (`:12437`): `scId ? allocGetActuals(...) : 0` —
  the `''` bucket rolls its **full** allocation even when unassigned hours were
  logged, and then `allocations[aKey] = actual > 0 ? actual : 0` deletes the
  source cell as if nothing was spent.

The correct actual for the `''` bucket in both places is
`allocGetActuals(projKey, '', fromYM)` (entries logged without a sub-code).
Consequence today: the roll-all button's label (allocated − all-project
actuals, from the drill header) doesn't match what actually moves.

Also: `_rollProjectAllSubsForward` iterates `proj.subCodes + ''` only, so
allocations parked on **orphaned/deleted sub-codes** never roll.

---

## Medium

### 7. Team cockpit gauge counts completed relay legs and other people's active legs
`estFor` (`:9339`) uses `_relayPersonEst(item, person)` = sum of **all** of
that person's stages, including stages already passed (✓ done). Week-load and
backlog overstate accordingly. Additionally, an item due within 7 days counts
the person's full stage-hours even when the baton is currently with someone
else. Consider summing only stages with index ≥ `relayStage` (and, for
week-load, only when the person holds or is next to hold the baton).

### 8. `packIntoFreeDays` / `findNextFitDay` window clamp is inverted for far deadlines
`const to = opts.before && opts.before < addDays(from, 180) ? opts.before :
addDays(from, 70)` (`:10153`, `:11523`): a deadline 6+ months out yields a
**70-day** search window — shorter than a deadline 5 months out. Likely
intended: `min(before, from+180)` or similar. Latent related bug:
`roundToQuarter(0)` returns **0.25** (`:5435`), so `packIntoFreeDays(0)` would
pack a phantom quarter-hour; both current callers guard with `rem < 0.25`, but
the function is unsafe for future callers — clamp to 0 inside.

### 9. Timesheet month view: boundary weeks mix cross-month logged with month-clipped planned
Week rows inside a month (`:10885–10890`) filter logged entries by the full
Sun–Sat week (including days in adjacent months) but planned items come from
`plannedItems(ms, me)` (month-only). A month-boundary week compares
logged-across-months + planned-within-month against a full 7-day capacity;
sums of week bars also exceed the month bar. Pick one convention (clip both to
the month, or query planned for the true week range).

### 10. Projects tab: subtasks with a different sub-code than their parent session are invisible
`getItemsForSubCode` (`:8039–8051`) only iterates subtasks *inside* a session
whose sub-code matches the section, then filters subtasks to that same
sub-code. A subtask explicitly assigned to sub-code X under a session on
sub-code Y appears in **no** section — while `allocGetPlanned`/Capacity still
count it under X. Iterate subtasks independently of the parent match.

### 11. Completing a recurring item can land the anchor on a skipped occurrence
`confirmComplete` (task `:7674`, session `:7593`, subtask `:7625`) advances via
`nextRecurrenceAfter` without consulting `recurrence.skips`; the new
`due`/`date` may be a date the user explicitly skipped. Display expansion then
filters it out (skips list) while the stored anchor sits on it — the next
visible occurrence differs from the stored one, and `openCompletionModal`'s
"final recurrence" check (`:7405`) is similarly skip-blind. Advance in a loop
until the date is not in `skips`.

---

## Minor / cosmetic

- **`barColor` / `allocSummaryCell` dots** (`:14052`, `:14070`): `Math.round`
  before comparing to 100 means up to ~100.49% displays as green "100%";
  exactly-100% green is presumably intentional ("on target"), but the rounding
  hides small overruns.
- **`fmtQ` masks non-quarter legacy values** (`:5448`): display snaps to 0.25
  while sums use raw values, so a column of rows can visibly disagree with its
  total by up to 0.125h per row. New entries are guarded by `enforceQuarter`,
  so this only affects pre-existing data.
- **`_commitAllocImportPlan`** (`:13884`): `c.val + rollover` with a negative
  (overspend) rollover can store a ≤ 0 allocation, which every `allocated > 0`
  check then treats as "no allocation" while the cell still holds a value.
- **`capMoveItem` due = `YYYY-MM-15`** may be a weekend; the capacity views
  then show weekend load that the packer would never have created.

---

## Checked and confirmed intentional (do not "fix")

- Timesheet **pay-period bars = logged only** vs **month bars = logged +
  planned** — documented design intent in CLAUDE.md.
- Month-level **holds** counted in month totals but excluded from
  period/week/day bars (`_allocHold` filters).
- KME relay legs appearing both on the team board (stage `est`) and in
  My Tasks/Capacity (mirror task) — two lenses, never summed together;
  `plannedItems` deliberately excludes `wt_team`.
- Relay billing: quarter-round with 0.25 floor; checkbox-complete advances the
  relay with 0 extra hours (no double billing) — verified in
  `confirmComplete:7666` and `_logRelayLeg:9786`.
- One-timer-at-a-time banking in `_pauseOtherTimers` — wall-clock minutes
  cannot accrue on two items; timer→hours math is correct.
- `roundToQuarter`'s "round down when ≤5min over a quarter" is documented
  billing behavior.
- Pay-period capacity = weekdays × h/day with weekend overtime as flex signal.
