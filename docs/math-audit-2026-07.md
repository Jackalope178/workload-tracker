# Math & Calculations Audit — July 2026

Full-app audit of date math, recurrence expansion, capacity/planned-hours
aggregation, timesheet totals, allocations/rollovers, billing rounding, and
timer math. Line numbers reference `index.html` at commit `451fae7`.

Findings are ranked by severity. Items 1–2 were verified by executable
simulation of the exact code paths; the rest were verified by tracing every
caller.

**Update (same branch):** findings 1–6, 8, 10, 11 were FIXED in the first
fix pass; findings 7 and 9 were fixed in a follow-up after the semantics were
decided. Each finding below carries a status line. Fixes were re-verified with
the same simulations that proved the bugs (extracted from the patched file).
Only the minor/cosmetic items remain open.

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

**Status: FIXED.** `monthly-date`/`monthly-last-day` now step months until
the adjusted result lands strictly after `from`, and `nextRecurrenceAfter` is
wrapped with a monotonic guard (non-advancing result → `null`) so no future
regression can stall an expansion loop. Verified: the Feb 2026 repro now
yields Feb 2 → Feb 27 → Apr 1 → May 1 …, and the March window contains 0
phantom items.

### 2. Simple "Monthly" recurrence drifts at month end
`nextRecurrenceAfter` type `monthly` (`:5611`) uses `d.setMonth(d.getMonth()+1)`.
JS date overflow: **Jan 31 → Mar 3** (February is skipped entirely and the
anchor permanently drifts to the 3rd); Mar 31 → May 1; Aug 31 → Oct 1.
Verified by simulation: `2026-01-31 → 03-03 → 04-03 → 05-03 …`

Any monthly task anchored on the 29th–31st silently loses occurrences and
shifts its day-of-month.

**Status: FIXED.** The target day is clamped to the target month's length:
Jan 31 → Feb 28 → Mar 28 (no month ever skipped). Note the anchor day clamps
and stays — pin-to-the-31st behavior is what the `monthly-date` /
`monthly-last-day` types are for.

### 3. Tasks due on the current week's Saturday vanish from the My Tasks list view
Bucketing in `renderTasks` (`:6232–6246`) routes items to: overdue (`< today`),
today, Mon–Fri day buckets (`currentWeekDays`), or future weeks (`> wkEnd`).
A date **equal to `wkEnd`** (this week's Saturday, with Sunday-based weeks)
matches none of the branches and is silently dropped — the task appears
nowhere in list view until it rolls into Overdue next week. (Week-planner view
shows it in the weekend footer, so the two views disagree.)

**Status: FIXED.** A `d <= wkEnd` weekend bucket now renders as a
"Sat <date> — weekend" section after Friday (no weekday capacity bar).

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

**Status: FIXED.** All three recurring expansions in `plannedItems` now
window by the effective (override) date and additionally scan the overrides
map for occurrences rescheduled INTO the window from outside it. With this,
every non-hold item the function returns is dated inside the query range, so
aggregate callers are correct without re-filtering. Verified: an occurrence
moved Jul 13 → Aug 3 counts once in August and not in July.

### 5. Moving items between months leaves a stale `workDate` → hours don't actually move
Placement everywhere is `workDate || due` (`_expandPlanned:10184`), but:

- `capMoveItem` (`:12161`) sets `due = newMonth-15` and `allocMonth`, never
  touching `workDate`. For an item with a work date, the toast says
  "Moved to 2026-09" while its hours stay planned on the old `workDate`
  (and `allocMonth` now disagrees with placement).
- `_projCapDropAssign` (`:7953`) writes `t.due = dateStr` directly instead of
  `_applyWorkPick`, same stale-`workDate` result.

Contrast: `capParkHolds` (`:11119`) and `_capAssignOne` (`:11078`) handle
`workDate` correctly.

**Status: FIXED.** `capMoveItem` clears `workDate` on all three item types;
`_projCapDropAssign` now routes through `_capAssignOne`, which owns the
work-date/deadline/allocMonth semantics.

### 6. Rollover math for the project-level ('' sub-code) bucket is wrong in roll-all
- `_rollProjectAllSubsForward` (`:12437`) used `scId ? allocGetActuals(...) :
  0` — the `''` bucket rolled its **full** allocation even when unassigned
  hours were logged, and `allocations[aKey] = actual > 0 ? actual : 0` deleted
  the source cell as if nothing was spent. The correct spend for the `''`
  bucket is `allocGetActuals(projKey, '', fromYM)` (entries logged without a
  sub-code).
- It also iterated `proj.subCodes + ''` only, so allocations parked on
  **orphaned/deleted sub-codes** never rolled.

**Correction to the original finding:** `_rollRemainingForward`'s
`scId='' → allocGetAllProjectActuals(...)` path is only reachable for projects
**without** sub-codes (the drill routes has-subs projects to roll-all), and
for a no-subs project all-project actuals IS the right spend — that half was
not a bug and is unchanged.

**Status: FIXED.** Roll-all now uses `allocGetActuals(projKey, scId, fromYM)`
for every bucket including `''`, and orphaned sub-code buckets are included in
the roll.

---

## Medium

### 7. Team cockpit gauge counts completed relay legs and other people's active legs
*(Status: FIXED — decision: the gauge measures FUTURE load. Week-load and
backlog now use `_relayPersonRemainingEst` — the person's stages at or after
the current baton position — so a meter drains as legs complete. The
"without estimate" chip still checks the person's total stage hours so an
item whose legs are simply all done isn't mislabeled as unestimated. An item
due soon still counts a person's remaining future legs even while someone
else holds the baton — if the whole deliverable lands this week, so do their
legs.)*
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

**Status: FIXED.** Both functions now use `min(before, from+180)` when a
deadline is given (70-day default otherwise), and `packIntoFreeDays` snaps
with `snapQuarter` clamped at 0 instead of `roundToQuarter`'s 0.25 floor.

### 9. Timesheet month view: boundary weeks mix cross-month logged with month-clipped planned
*(Status: FIXED — decision: true-week. The row's capacity already spans the
full Sun–Sat week, so planned work is now queried for the same full week
(`plannedItems(wStart, wEnd)`, holds excluded) instead of being clipped to
the month. Logged, planned, and capacity are now the same window; the known
consequence — boundary weeks appearing under two months, so week bars don't
sum to the month bar — already applied to logged hours and is inherent to
calendar-week rows.)*
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

**Status: FIXED.** Subtask iteration was unnested from the session match;
subtasks now appear in the section of their own sub-code.

### 11. Completing a recurring item can land the anchor on a skipped occurrence
`confirmComplete` (task `:7674`, session `:7593`, subtask `:7625`) advances via
`nextRecurrenceAfter` without consulting `recurrence.skips`; the new
`due`/`date` may be a date the user explicitly skipped. Display expansion then
filters it out (skips list) while the stored anchor sits on it — the next
visible occurrence differs from the stored one, and `openCompletionModal`'s
"final recurrence" check (`:7405`) is similarly skip-blind. Advance in a loop
until the date is not in `skips`.

**Status: FIXED.** New `nextActiveRecurrenceAfter` helper advances past
skipped dates; all anchor-advancing sites (three completion modals, three
`confirmComplete` branches, `skipRecurOccurrence`, `confirmReschedule`) use it.
Expansion loops keep the raw function since they filter skips themselves.

---

## Minor / cosmetic

- **`barColor` / `allocSummaryCell` dots** (`:14052`, `:14070`): `Math.round`
  before comparing to 100 means up to ~100.49% displays as green "100%";
  exactly-100% green is presumably intentional ("on target"), but the rounding
  hides small overruns. **Status: FIXED** — colors now compare the raw ratio;
  the displayed percent stays rounded.
- **`fmtQ` masks non-quarter legacy values** (`:5448`): display snaps to 0.25
  while sums use raw values, so a column of rows can visibly disagree with its
  total by up to 0.125h per row. New entries are guarded by `enforceQuarter`,
  so this only affects pre-existing data.
- **`_commitAllocImportPlan`** (`:13884`): `c.val + rollover` with a negative
  (overspend) rollover can store a ≤ 0 allocation, which every `allocated > 0`
  check then treats as "no allocation" while the cell still holds a value.
  **Status: FIXED** — a merged value ≤ 0 deletes the cell (matching `allocSet`);
  the overspend record stays visible via `_allocRollovers` in the drill popup.
- **`capMoveItem` due = `YYYY-MM-15`** may be a weekend; the capacity views
  then show weekend load that the packer would never have created.
  **Status: FIXED** — the 15th is run through `adjustToWeekday` (Sat → 14th,
  Sun → 13th; always stays mid-month).

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

---

## Addendum — recurrence & billing edge-case audit (July 2026, second pass)

Systematic probes of the recurrence engine, pay periods, quarter-hour guards,
and date arithmetic in the running app. Full probe set: month-end anchors
(day 29/30/31, last-day), leap years, weekday-adjust on weekend month-ends,
last-weekday patterns across 4/5-week months, biweekly multi-day, DST spring/
fall transitions, pay-period boundaries, negative/zero hour inputs.

### Fixed

1. **Plain "Monthly" month-end drift.** `type: 'monthly'` derived the target
   day from `from.getDate()`, so one short month clamped the anchor forever:
   Jan 31 → Feb 28 → **Mar 28 → Apr 28 …**. The three recurrence builders now
   stamp `dayOfMonth` (the intended day) via `_monthlyIntentDay`, and
   `_nextRecurrenceAfterRaw` clamps per-month from that intent instead:
   Jan 31 → Feb 28 → **Mar 31**. The helper is clamp-aware on re-save — a
   modal displaying the clamped Feb 28 for a "31st" intent keeps 31; moving
   the anchor to a genuinely different day re-stamps. Legacy items without
   the stamp keep the old behavior until re-saved (predictable, no surprise
   jumps).

2. **`enforceQuarter` accepted negative hours.** A typed `-2` estimate
   snapped to −2 and stored, silently SUBTRACTING from capacity/billing
   sums (HTML `min="0"` doesn't stop typed negatives). Now clamps at 0.

### Verified clean (probes, no change)

- DST: `addDays`/weekly stepping across 2026-03-08 and 2026-11-01 — no
  skips or repeats (calendar math on `T00:00:00` local Dates).
- Leap years: monthly-last-day lands 2028-02-29; `payPeriodOf` gives
  16–29 for leap Februaries.
- Weekday-adjust: Oct 31 2026 (Sat) → Oct 30; Jan 31 2027 (Sun) → Jan 29;
  sequences stay strictly increasing (the monotonic wrapper's month-step
  loop handles adjusted results landing before `from`).
- Last-weekday (`weekOfMonth: -1`) across 4- and 5-Friday months.
- `roundToQuarter(-2) → 0.25` is the documented 0.25-floor behavior; its
  callers guard with `Math.max(0, …)` first (see invariant #4).

### Contract notes (latent, documented — not live bugs)

- **`nextRecurrenceAfter(task, from)` assumes `from` is an occurrence** for
  `monthly`/`monthly-weekday` (it starts at the NEXT month, so a mid-month
  non-occurrence `from` skips that month's occurrence) and for `biweekly`
  (parity anchors to `from`'s week). Every current caller walks
  occurrence-to-occurrence from the stored anchor, so this holds today —
  keep it true: don't call these with arbitrary dates.
- `today()` is pinned to America/New_York while `localDateStr` uses the
  browser's zone — consistent for the app's single ET user; a non-ET device
  could disagree near midnight. Known constraint, not worth the complexity
  to change.

Regression coverage: `.claude/skills/verify/run.sh` scenarios 01–03 encode
the fixes and the clean behaviors above.

## Addendum — zero-billable close-out (2026-07-15)

**Symptom (user report):** hours logged through work blocks didn't reconcile
with Allocations actuals. Root cause: `confirmComplete` clamped the billable
field with `Math.max(0.25, …)`, so typing **0** at close-out (to decline
billing the prefilled remainder) still wrote a **phantom 0.25h entry** to
`wt_completed` — which Allocations, Timesheet, and the pay-period bars all
sum. Compounding it, `openCompletionModal` prefilled the remainder of a
blocked task with `roundToQuarter(_ownPlannedHours(task))`; the 0.25 floor
turned a fully-blocked task's true 0h remainder into a suggested 0.25 —
exactly the invariant-#4 misuse this audit documented.

### Fixed

1. **Typed 0 now bills 0.** `confirmComplete` uses
   `Math.max(0, enforceQuarter(…))`; an emptied field counts as 0 too.
   Semantics by item kind:
   - **Work block at 0h** → block marked done, **no ledger entry** (the
     planned time is cancelled; earlier logged blocks keep their entries).
     Matches `_logRelayLeg`, which already skipped the entry at 0.
   - **Task / session / subtask at 0h** → archived with `actualHours: 0`
     (the archive row survives for history/wins; billing sums unchanged).
2. **Remainder prefill is zero-safe.** The blocked-task branch of
   `openCompletionModal` now uses `Math.max(0, snapQuarter(…))`.
3. **UI makes 0 a first-class action:** a 0h shortcut button beside the
   billable input, a context hint (`compZeroHint`) spelling out what 0 does,
   and the confirm button relabels live ("Complete — bill 0h") so a no-bill
   close is never a surprise.

The 0.25 floor still applies to any hours > 0. Regression coverage:
`.claude/skills/verify/suite/11-zero-close.js`.

**Cleanup note for existing data:** phantom 0.25h entries created before
this fix remain in `wt_completed`; edit or delete them from the Timesheet
day view (the entry editor accepts 0h).

## Addendum — work-block lifecycle audit (2026-07-15, follow-up pass)

A targeted audit of how block-logged hours survive later actions, prompted
by the same Allocations mismatch. Seven verified findings, all fixed:

1. **Timesheet outstanding ▣ rows completed the PARENT.** The planned-row
   checkbox called `openCompletionModal(parent)` for block rows — one click
   on what looks like a 2h block opened "Complete Task", billed only the
   un-blocked remainder, deleted the task, and silently cancelled every
   sibling block (hours neither billed nor planned). Likely the original
   incident. Now routes to `openBlockCompletionModal`.
2. **Capacity drill-down ▣ rows: same mis-route on ✓ Done**, plus **Move
   moved the parent** (cleared its `workDate`, re-dated `due`) while the
   block stayed put — the wrong hours moved in every planned meter. ✓/Move
   now act on the block (`capMoveItem('block', …)`); Delegate (a whole-task
   action) no longer renders on block rows.
3. **Un-ticking a done block resurrected its planned hours but left its
   ledger entry** — hours counted twice (logged + planned), and re-logging
   billed twice. Entries are now linked (`_blockRef` on the entry,
   `entryId` on the block); un-ticking retracts the entry with an undo
   toast. Entry-less done blocks (0h cancels, pre-link data) just re-open,
   with a toast noting any old entry stays on the Timesheet.
4. **`saveEditTask` re-rounded done blocks' hours** through `roundToQuarter`
   on every save — a billed block's plan-side hours could drift (and a 0
   would floor to 0.25), silently changing the remainder. Done blocks are
   now frozen; only open blocks quarter-snap.
5. **Recurrence conversion dropped LOGGED blocks.** Picking a recurrence
   wiped `blocks[]` including done ones — est re-grew into the plan while
   the block hours sat billed in the ledger (double count). Conversion now
   refuses while logged blocks exist (guard runs before any mutation).
6. **Closing a parent with open blocks silently discarded their hours**
   (not billed, not planned, no notice). Still allowed — cancelling planned
   work is legitimate — but the modal hint now warns with the block count
   and hours, and the close toasts what was cancelled.
7. **Week planner block cards had no ✓** (comment claimed blocks "log
   through their parent's plan" — untrue). Block cards now log their own
   block, consistent with My Tasks/Projects/Timesheet.

Verified clean in the same pass: `plannedItems` block expansion (done
blocks excluded, parent carries `max(0, est − Σblocks)` remainder, blocks
land on their own dates → Capacity/Timesheet/Allocations planned all agree);
week-planner drag moves `b.date`; `capRebalanceDay` deliberately never
auto-moves blocks; hand-off subtracts done-block hours; My Tasks/Projects
child-row checkboxes and date pickers were already block-scoped; block
child rows only render for open blocks, and the block editor locks done
rows (no delete ×).

Regression coverage: `.claude/skills/verify/suite/12-block-locking.js`.
