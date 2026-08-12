# Recurrence Audit — August 2026

**Trigger:** a recurring occurrence slipped past its date un-actioned, and the
attempt to recover ("move it or cancel it") knocked the whole sequence off
schedule. This audit maps how the recurrence engine works, catalogues every
user need around shifting/resetting occurrences, verifies which paths are
sound, and identifies where the sequence actually gets corrupted.

Companion to `docs/math-audit-2026-07.md` (whose invariants #1/#2 govern the
generator math — those all held; this audit is about the *affordance layer*
on top of a sound engine).

> **Resolution status (Aug 2026, same branch):** F1a, F2, F3, F5 (tasks),
> and F6 are FIXED; ⏩ Catch up (recommendation 2) and honest-edit-modal
> (recommendation 3, minus the one-off-vs-series prompt) are IMPLEMENTED.
> Verify scenario `18-recur-occurrence-tools.js` enforces the new invariant
> (CLAUDE.md math invariant #9: *anchors only move along natural occurrence
> dates*). Still open, by design of the staged plan: the unified occurrence
> menu (rec. 4), session/subtask per-occurrence tools (rec. 5 / F4 — their
> date picks and month moves now refuse with an honest toast instead of
> silently corrupting or no-op'ing), the one-off-vs-series question on an
> explicit date change (still re-anchors the series, as before), and the
> completion-flow "skip the other N missed" offer. See §6 for how the fixes
> interact with allocation month holds.

---

## 1. How recurrence actually works (mechanics recap)

A recurring item is a **single template record**; occurrences are computed,
never stored. Grep anchors: `nextRecurrenceAfter`, `nextActiveRecurrenceAfter`,
`_nextUpcomingRecurrence`, `skipRecurOccurrence`, `confirmReschedule`.

- **The anchor** is `task.due` (tasks) / `s.date` (sessions/subtasks): the
  earliest *un-resolved* occurrence. Expansion loops (`renderTasks`,
  `plannedItems`, timesheet) walk `cursor = anchor → nextRecurrenceAfter(...)`
  forward. The anchor itself is always emitted as occurrence #1 —
  **regardless of whether it matches the pattern** (an anchor moved to a
  Wednesday on a Monday-weekly emits a stray Wednesday occurrence).
- **Per-occurrence edits** live inside `recurrence`:
  - `skips: []` — original occurrence dates to omit.
  - `overrides: { origDate: newDate }` — one-off moves. Expansion renders
    `overrides[cursor] || cursor`; the *key* is always the natural date.
- **Resolving an occurrence** (complete / skip / reschedule-the-anchor)
  advances the anchor by exactly one step via `nextActiveRecurrenceAfter`.
- **Pattern anchoring:** biweekly parity derives from the anchor's week
  (moving the anchor ±7 days shifts every future occurrence by a week);
  plain-monthly intent survives via `recurrence.dayOfMonth`
  (`_monthlyIntentDay`); weekly day comes from `daysOfWeek`, not the anchor.

The engine itself is sound (monotonic guard, skip-aware advancement, clamp
handling). **Every problem found below is in the UI paths that write the
anchor.**

## 2. The user-need taxonomy ("the myriad")

| # | Need | Today's answer | Verdict |
|---|------|----------------|---------|
| N1 | Move **just this one** occurrence | 📅 reschedule → `overrides` | ✅ exists (tasks only), sound |
| N2 | Skip **just this one** | ⏭ skip / row-delete → "just this occurrence" | ✅ exists (tasks only), sound |
| N3 | **I missed one (or several) — reset to the next real date** | *No first-class affordance.* Repeated ⏭, or the edit modal's silent re-anchor side effect (F1) | ❌ the reported pain |
| N4 | Shift the **whole series** permanently | Type a new date in the edit modal | ⚠ works but trap-laden (F1b) |
| N5 | Did it late, want to log it | Completion modal (advances one step) | ✅ sound; loops if 2+ missed |
| N6 | End / pause the series | `recurrence.endDate`, close-out sets it to today | ✅ sound |

Needs N1/N2 exist **only for tasks, only in two surfaces** (My Tasks rows,
Timesheet outstanding rows). Everywhere else the natural gesture — click the
date, pick a new one; or "Move" — is recurrence-blind (F2, F4, F5).

## 3. Findings

### F1 — The missed-occurrence trap (the reported bug-shaped experience)

When an occurrence passes un-actioned, the anchor stays in the past and the
row sits in Overdue. Every recovery gesture then misbehaves in a different way:

- **F1a — editing the task silently re-anchors.** `openEditModal` prefills
  the due field with `_nextUpcomingRecurrence(task)` (the *next upcoming*
  occurrence, deliberately not the stale anchor), and `saveEditTask` writes
  that value back to `task.due` unconditionally. Net effect: **saving any
  edit — even fixing a typo in the notes — silently discards every missed
  occurrence**, with no toast, no skip record, no undo. This is presumably
  how the sequence "got off" without an explicit action.
- **F1b — typing a new date re-anchors with pattern traps.** Biweekly parity
  follows the anchor's week, so re-anchoring into the wrong-parity week
  shifts the entire future series by 7 days. A weekly anchor placed on an
  off-pattern day emits a stray occurrence on that day (anchor is always
  occurrence #1). Nothing warns, and nothing asks "just this one, or the
  whole series?".
- **F1c — completing late only advances one step.** Correct per-occurrence
  bookkeeping, but if 2+ were missed the task is *still* overdue after
  completing, which reads as "it didn't work" and invites the F1a/F1b
  gestures. There is no "…and skip the other N missed" offer.

### F2 — Capacity drill-down **Move re-anchors the whole series** (real corruption)

`_renderCapItemList` renders a **Move** button on recurring occurrence rows
(no `_recur` guard), and `capMoveItem('task', id)` resolves the composite
occurrence id back to the template and writes `t.due =
adjustToWeekday('YYYY-MM-15')` + `allocMonth`. Moving what looks like "this
occurrence" **rewrites the series anchor to the 15th of an arbitrary month**:
every occurrence before that date vanishes, biweekly parity re-rolls, and a
stray mid-month occurrence appears. `capRebalanceDay` explicitly refuses to
auto-move recurring occurrences ("use skip/reschedule") — the drill-down Move
button is an oversight of the same rule, not intent. Sessions/subtasks: same
hole.

### F3 — Timesheet ⊘/📅 pass the **effective** date, not the occurrence key

The Timesheet outstanding rows call `skipRecurOccurrence(id, item.date)` /
`openRescheduleModal(id, item.date)`, where `item.date` is the
**post-override display date**. `skips`/`overrides` are keyed by the
*original* natural date, so on an already-rescheduled occurrence: the skip
never matches the expansion cursor (row survives) **and** lies in wait to
suppress a future natural occurrence that happens to land on that date;
a second reschedule writes a chained override entry that nothing reads.
The My Tasks rows already do this correctly (`item._occurrenceDate ||
task.due`) — the Timesheet call sites just predate that field
(`plannedItems`' occurrence objects carry the orig date in their `id` suffix
but don't expose it as a field).

### F4 — Recurring sessions/subtasks have **no per-occurrence controls at all**

The data model and every expansion loop honor `skips`/`overrides` on
sessions/subtasks, but **no UI ever writes them** — `skipRecurOccurrence` /
`confirmReschedule` are task-only, and session/subtask rows render an empty
actions slot. The week-planner drop handler refuses recurring session
occurrences with *"reschedule it from the Projects view"* — but the Projects
view only opens the series editor. The instruction is a dead end.

### F5 — Date chips on recurring rows are recurrence-blind (silent no-op)

Clicking the date on a recurring occurrence row opens the capacity date
picker → `_applyWorkPick`, which sets `workDate` — **which every recurring
expansion ignores**. The most natural gesture ("click the date, pick a new
one") visibly succeeds and changes nothing, stranding a `workDate` on the
template (later nulled by `saveEditTask`). Same for
`openSessionDatePicker` on recurring sessions/subtasks.

### F6 (minor) — `_confirmDeleteRecur` advances with the skip-blind function

The delete-row → "just this occurrence" path advances the anchor via
`nextRecurrenceAfter` instead of `nextActiveRecurrenceAfter`, so the anchor
can land on an already-skipped date. Display stays correct (expansion filters
skips) but it's inconsistent with `skipRecurOccurrence` and leaves the anchor
on a date that will never render.

### F7 (minor) — Reschedule has no ordering guard

An occurrence can be moved past the *next* occurrence (two on one day, or an
"earlier" occurrence rendering after a "later" one). Mathematically fine
(math-audit invariant #2 windows by override date), just occasionally
surprising. Cosmetic.

### What's already good

Skip/reschedule are undoable (`pushRecurUndo` restores anchor + recurrence
verbatim); the reschedule modal's copy ("All other occurrences stay on their
original schedule") is exactly right; the monotonic guard and skip-aware
anchor advancement mean **no path examined can make the engine loop or
double-emit** — corruption is limited to anchors being moved to wrong dates.

## 4. Recommendation — one occurrence menu + an explicit Catch-up

Design principle: recurring items need **four verbs** (move one / skip one /
catch up / change series), and every surface should route to the **same
shared implementation** rather than each surface improvising with
anchor-writes. Concretely, in priority order:

1. **Fix the corruption bugs first** (small, surgical):
   - F2: in the Capacity drill-down, recurring occurrence rows route Move to
     the occurrence menu below (or at minimum to reschedule) instead of
     `capMoveItem`.
   - F3: pass the original occurrence date (expose `_occurrenceDate` on
     `plannedItems` recurring entries, or derive from the `id` suffix).
   - F6: use `nextActiveRecurrenceAfter`.
2. **⏩ Catch up — the missing "reset" verb (N3).** One click on an overdue
   recurring item: record `skips` for every missed natural date and advance
   the anchor to the next upcoming occurrence. Skips-as-record (rather than
   F1a's silent re-anchor) keeps an audit trail, keeps `overrides` intact,
   is undoable via the existing `pushRecurUndo`, and never touches parity or
   day-of-week (the anchor only ever moves to a *natural* occurrence date).
   Surface it wherever the overdue state is visible: the Overdue row
   (`⏩` beside `⏭ 📅`), the edit modal (see 3), and optionally the
   completion toast when more missed occurrences remain ("skip the other
   N missed?").
3. **Make the edit modal honest (F1a/F1b).** Show the next-upcoming date as
   the editable value but treat it as *display* unless changed: only write
   `due` back when the user actually edited the field. When the anchor is in
   the past, show a one-line status — "2 missed occurrences · series resumes
   Tue Aug 18 [⏩ Catch up]" — instead of silently absorbing them. When the
   user *does* change the date, ask the standard calendar-app question:
   **"Move just the next occurrence, or shift the whole series?"** (one-off
   → `overrides`; series → re-anchor, with a parity-aware note for biweekly).
4. **A shared `openOccurrenceMenu(ref, occDate)` popover** — Move this one /
   Skip this one / Catch up (when overdue) / Edit series — wired to every
   place a recurring occurrence's date is clicked or moved: My Tasks date
   chips (F5), Capacity drill-down rows (F2), Timesheet rows, week-planner
   drop (replacing the refusal toast with the menu). One implementation, one
   vocabulary, no more recurrence-blind date writes.
5. **Session/subtask parity (F4):** generalize `skipRecurOccurrence` /
   `confirmReschedule` to take a source ref (`{src, projId, sessionId, id}`,
   same resolution shape as `_capResolveId`) so the shared menu works for all
   three item types, making the week-planner toast's promise true.

Per the repo SOPs, whichever slice ships must update `INFO_COPY`,
`_TAB_TIPS`, and the welcome tour in the same change, add a
`.claude/skills/verify/suite/` scenario (missed-occurrence catch-up:
anchor advances to a natural date, skips recorded, parity preserved), and
fold the new invariant ("anchors only ever move to natural occurrence dates;
one-off moves are overrides") into `CLAUDE.md`.

## 5. Recovery (updated for the shipped fixes)

- **Missed one or more occurrences:** click **⏩** on the overdue row (or
  the ⏩ Catch up button in the edit modal's missed banner) — every missed
  date is recorded as a skip and the series resumes on its own schedule.
  Undoable. ⏭ still skips exactly one.
- **Anchor already re-anchored wrong (e.g. biweekly off by a week):** open
  the edit modal and set the due date to any *correct* past-or-future
  occurrence date (the natural day-of-week/parity); the series regenerates
  from there. For plain-monthly, setting the date re-stamps the intended
  day-of-month automatically. (An explicit date change in the modal is the
  one remaining deliberate way to re-anchor a series.)
- **Did the work late:** complete the overdue row and backdate the
  completion date in the modal — then ⏩ catch up the rest.

## 6. Allocation month holds — interaction analysis (Aug 2026)

Checked while implementing, because holds share fields with recurrence:

- **Dated recurring items ignore `allocMonth`** in every expansion
  (`plannedItems`' date-based branch never reads it), so catch-up /
  reschedule / skip never need to touch it. No change needed.
- **Recurring month holds** (recurrence + `allocMonth`, no `due`) are a
  separate expansion (`plannedItems`' hold branch): monthly emissions from
  the start month, `skips`/`overrides` **not consulted**, and the walk
  fast-forwards past old months — a hold can never go overdue. Therefore
  catch-up doesn't apply (guarded on `!task.due`), and the ⏭/📅 row buttons
  no longer render for them (previously ⏭ was a silent no-op and 📅 could
  write a junk `overrides['']` entry — both guarded now).
- **Moving a recurring hold stays allowed** (`capMoveItem`'s recurrence
  guard checks for a date): the move re-parks `allocMonth`, i.e. the month
  the hold series *starts*. That is the only month-level knob a hold series
  has and it does not corrupt anything.
- **A hold graduating to a dated series is preserved:** picking a date on a
  recurring hold's row (or dragging it from the Projects capacity split)
  still writes the anchor — that's how a hold acquires its first real
  occurrence date. The new guards only refuse when a date already exists.
- **Reschedule keeps `allocMonth` untouched** for dated recurring items
  (inert per the first bullet), and `_applyWorkPick`'s hold-re-parking
  branch is unreachable for them now that recurring rows route to the
  occurrence reschedule.
