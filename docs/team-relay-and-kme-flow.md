# Team Deliverables — Relay & KME Flow

Living map of the Team Deliverables **relay** (multi-stage pass-around) and, in
particular, how legs assigned to the app owner (**KME** / the `'Me'` sentinel)
tie into **My Tasks**, **Capacity**, and **Timesheet/Billing**. Also logs the
*intent* behind each change so future work stays aligned. Everything lives in
`index.html`; this file is documentation only.

---

## Vocabulary (the owner's mental model)
- **Deliverable** — anything a teammate is tagged on (Team tab). Renders as a
  uniform card; no per-source badges.
- **Task** — the owner's *own billable work* (My Tasks tab).
- **KME** — the app owner. Stored as the `'Me'` sentinel, displayed as "KME" on
  the Team tab (`_relayWho('Me') => 'KME'`).
- **Relay** — an ordered list of stages a deliverable passes through.
- **Baton / holder** — whose turn it is now = the current stage's assignee.

---

## Data model
**Team deliverable** (`wt_team` item) relay fields:
- `relay`: `[{ id, kind, who, est, due, note }]` — `kind ∈ work | review | send`.
  (No per-stage label — removed by design; type + person convey the leg.
  `note` is different: an optional free-text annotation of what the leg is
  actually doing, edited via the hover 📝 in the stage row and shown on cards
  in the yellow waiting-on style while that leg holds the baton.)
- `relayStage`: index of the current stage. `>= relay.length` ⇒ complete.
- `activeOwner`: current holder (kept in sync = `relay[relayStage].who`).
- `owners`: derived = unique stage assignees, **including `'Me'`** so KME gets a
  board/pill.
- `reviewTaskId`: id of the linked My-Tasks mirror while a `'Me'` leg is active.
- `relayLog`: `[{ from, at, action, hours? }]` history.

**Mirror task** (`wt_tasks` item): a normal task + `_deliverableId` back-link,
`delegatedTo: null` (so it shows in My Tasks and counts as personal work).

---

## Status derivation — `relayStatusInfo(item, person)`
Perspective-aware (`person` = whose board; `null` = Everyone/list):
- **Holder's board** → column `in-progress`; label `Reviewing` / `To send` /
  `In progress`.
- **Anyone else / neutral (in-flight)** → column `in-review`; label
  **`Waiting on <who>`**.
- Board columns: **"Ready for Review" + "In Review" render as ONE merged
  "In Review" column** (`BOARD_COLS` in `renderTeamBoard`). The two statuses
  still exist for non-relay items; they just share a column.
- No "your turn" badge — the column already conveys whose turn it is.

---

## The KME flow (step by step)
1. Baton reaches a `who:'Me'` stage → `_relaySync` → `_syncBatonMirror` creates
   (or revives) a **mirror task** in `wt_tasks` carrying the deliverable's
   `project` + `subCode` (billing), the **stage's** `est` + `due`,
   `delegatedTo:null`, `_deliverableId`.
2. Mirror shows in **My Tasks** (`↩ team` badge + `Pass →` chip), flows into
   **Capacity** via `plannedItems()`, and counts KME's review load.
3. Finishing the leg — **two equivalent paths, both bill once + advance**:
   - **Pass →** (My Tasks chip, board button, Everyone board, or edit-modal
     strip): opens the log-hours prompt (prefilled with stage `est`; also sets
     the *next* leg's due), logs hours to `completed[]` via `_logRelayLeg`
     (billing = deliverable `subCode`), closes the mirror, advances.
   - **Checkbox complete** in My Tasks: logs hours via the normal completion
     modal, then `confirmComplete` advances the relay with **0 extra hours**
     (so billing isn't double-counted) and removes the mirror task.
4. Baton leaves `'Me'` → `_closeBatonMirror` marks the mirror complete if still
   open.

---

## The four connections
| Subsystem | How a KME leg ties in | Key function(s) |
|---|---|---|
| **My Tasks** | mirror task (`delegatedTo:null`, `_deliverableId`) | `_syncBatonMirror`, `_taskRelayPassBtn` |
| **Capacity** | mirror task `est`+`due` → forward planner | `plannedItems`, `_ownPlannedHours` |
| **Timesheet / Billing** | `completed[]` entry (`subCode`, `actualHours`) | `_logRelayLeg`, `confirmComplete` |
| **Team board (KME pill/board)** | `'Me'` in `owners`; perspective status | `_relaySync`, `renderTeamBoard`, `relayStatusInfo` |

---

## Known gaps / deliberate decisions
- ~~Undated legs don't reach Capacity.~~ **Closed:** an undated active Me leg
  now sets `allocMonth` (current month) on the mirror, so it appears in the
  Capacity planner as a hold (`_allocHold`) and releases on completion.
- **Billing convention:** relay leg hours are quarter-rounded with a 0.25 floor
  (`roundToQuarter` in `_logRelayLeg`), matching the completion modal.
- **Relay → mirror is one-way.** Editing the mirror task does not update the
  relay stage.
- **One billing code per deliverable.** All legs bill to the deliverable's
  `project`+`subCode`; stages don't carry their own code.
- **Two representations by design.** A KME relay item appears on the KME team
  board *and* as a My-Tasks mirror (team-side vs personal-side). Not additive
  across meters: the team cockpit gauge uses the person's REMAINING stage
  hours (`_relayPersonRemainingEst` — legs at/after the baton; done legs are
  spent effort, not load); Capacity uses the mirror task.
- **Capacity double-count guard.** The main Capacity/Allocations planner reads
  `plannedItems()` which does **not** include `wt_team` deliverables — only the
  mirror task — so KME's review load is counted once.

---

## Key function index (all in `index.html`)
- `relayStatusInfo(item, person)` — perspective status (col + label).
- `relayStage/relayIdx/_relayDone/_isRelay` — stage accessors.
- `_relaySync(item, prevWho)` — recompute owners/baton/status + mirror on change.
- `relayAdvance(id, hours?)` — Pass. `hours` omitted on a Me leg ⇒ opens the log
  prompt; a number (incl. 0) ⇒ proceed without prompting.
- `relayBack(id)` — send back a stage.
- `_syncBatonMirror / _closeBatonMirror` — create/revive/close the My-Tasks mirror.
- `_logRelayLeg(item, stage, hours)` — push the billing entry + close mirror.
- `_relayPersonEst(item, who)` / `_relayTotalEst(item)` — hour rollups.
- `_effTeamDue(item)` — effective due = current stage due (fallback deliverable).
- `_taskRelayPassBtn(task)` — the `Pass →` chip in My Tasks.
- `renderTeamBoard` — `BOARD_COLS` (merged review column), cockpit, cards.
- `_renderRelayEditor / _relayAddStage / _relaySet` — the relay editor rows.

---

## History of asks (intent log)
Chronological; newest last. Keeps the *why* across threads.
1. **Intern cockpit** — per-person capacity gauge, scorecard chips, `priority` +
   `est` on deliverables.
2. **Hand-off baton (single)** + My-Tasks mirror; owners **additive** (everyone
   stays involved).
3. **Pass from any view** — "Ball in court" in the edit modal.
4. **`task` visibility toggle**; fixed date edits not refreshing the board.
5. **Multi-stage relay** — stages, rail, Pass/Back, contextual status, Me-leg
   mirror + billing prompt. Decisions: **per-item** (no templates),
   **prompt-to-log on pass**, build the full thing.
6. **Per-stage `est` tied to the assignee** — hours roll up per person.
7. **First stage = the main task** (seed who/est/due); badge shows "In progress"
   rather than echoing the deliverable name.
8. **Perspective-based status** — holder = In Progress, others = In Review;
   collapsed the two review sub-states; removed the "Start" step.
9. **Pass from My Tasks** + **per-stage due dates** (effective due, next-due set
   at pass time).
10. **Uniform deliverables** (drop `↗ session`/`task` badges) + **KME pill/board**
    (`'Me'` added to owners; "task" reserved for personal billable work).
11. **Removed the redundant "your turn" badge** (column conveys it).
12. **"Waiting on [person]"** labels for in-flight cards; cockpit chip
    "Waiting on KME".
13. **Removed the per-stage label text box** (type + person are enough).
14. **Merged the two review board columns** into one "In Review".
15. **Audit of the KME flow** → fixed checkbox-complete not advancing the relay
    (and its double-billing risk); wrote this doc.
16. **Roster in dropdowns** — board/person selectors list all `PERSONS`, not
    just people who already own items.
17. **Person-colored rail + badges** — rail dots show initials in each person's
    color (current = solid + ring, upcoming = faint, done = quiet ✓);
    "Waiting on X" badges tinted with X's color. Vision: *where is it floating*
    should read as a recognizable color before words.
18. **Ecosystem audit (plate / holds / logging)** — verified mirror creation on
    save (not only on pass); undated Me legs now hold the current month in
    Capacity via `allocMonth` and release on completion; relay billing
    quarter-rounded (0.25 floor); Allocations month actuals and the Timesheet
    pick up relay entries via `completed[]`.
19. **Math audit follow-up** — cockpit gauge switched from total person stage
    hours to *remaining* stage hours (`_relayPersonRemainingEst`), so the
    per-person meter drains as legs complete; scorecard "without estimate"
    still checks the total.
20. **Meetings column** — the board's Blocked column became **Meetings**:
    anything meeting-priority while active (typically My-Tasks meetings
    delegated to teammates) routes there, so tagged people see the meeting
    and its hours on their board. Blocked cards fold into In Progress
    (keeping the 🚫 badge); the cockpit Blocked chip still isolates them.
21. **Per-person allocation meters** — the cockpit's weekly-capacity gauge was
    replaced by **allocation meters**: monthly hours KME budgets per person
    per billing code (`wt_person_allocs`, keyed `person|projKey|scId|YYYY-MM`,
    edited via the + Allocation popup: current + next 6 months; ‹ › month nav
    on the cockpit). Bar total = allocation; solid fill (project color) = the
    person's completed work that month; lighter overlay = planned. To
    attribute completed work: `relayLog` pass entries now record hours for
    **teammate legs too** (stage est; KME legs keep actually-logged hours),
    and non-relay completions stamp `completedAt` / per-person
    `ownerStatusAt[person]`. Key fns: `_personCompletedHoursByCode`,
    `personAllocKey`, `openPersonAllocModal`. The old `wt_person_capacity`
    weekly-cap data is retained but no longer surfaced.
22. **Stage notes** — reintroduced per-leg annotation as `note` (NOT the old
    label field): hover a stage row in the relay editor → 📝 after the ↑↓
    arrows opens a note input. The current leg's note shows on board cards
    and list rows in the yellow waiting-on style, because "Work — X" alone
    isn't informative enough. Rail tooltips include it.
23. **Catch-all allocation bars** — a no-sub-code allocation absorbs ALL of
    that project's completed/planned hours not claimed by a sub-code-specific
    bar in the same month (`_hoursFor` in the cockpit). Sub-code bars claim
    exact matches first; the project-level bar sweeps the rest, so "20h of
    Project X however it splits" works alongside carved-out codes. The bar is
    labeled "· catch-all".
24. **Hand off as deliverable (task → relay)** — the task edit modal grew a
    **⇄ Hand off as deliverable…** button (`showTaskHandoffDropdown` /
    `handoffTaskAsDeliverable`): pick a person and the task converts into a
    `wt_team` deliverable pre-seeded `Work — <person>` (task's est + due) →
    `Review — Me` (0.25h), then the deliverable modal opens so stages can be
    adjusted before saving. The source task is **deleted** — one home for the
    hours: Capacity drops it (task gone from `wt_tasks`), the person's board
    gains the work leg, and the Me review leg re-enters My Tasks/Capacity
    later via the normal baton mirror. Guards: **recurring tasks refuse**
    (recurring involvement — e.g. Jordan on biweekly check-ins — is what the
    lightweight `delegatedTo` tag is for; it keeps her on every occurrence),
    **mirror tasks refuse** (already a relay leg; the button is hidden), and
    **timer time warns** before discarding (it can't follow the task).
    Provenance: `relayLog` gets `{ action: 'handoff' }`, which the
    allocation-meter math ignores (it only reads `pass` entries). The
    conversion snapshots the open modal's fields, so unsaved edits hand off
    as shown.
25. **Hand-off mirrored on the Projects tab (+ cohesion & escaping)** — the
    work-item/subtask modal grew the same **⇄ Hand off as deliverable…**
    button (`showSessionHandoffDropdown` / `handoffSessionAsDeliverable`),
    sharing `_handoffCreateDeliverable` / `_handoffOpenPicker` /
    `_handoffTimerOk` / `_handoffFinish` with the task path — SOP: never
    reimplement the conversion inline; new entry surfaces call the helpers.
    Hours math extras beyond the task path: **a handed-off subtask's hours
    are subtracted from its parent session's total** (else the parent's
    un-subtasked remainder grows back and the hours count twice), a session
    with **open subtasks refuses** (hand them off individually first), and
    **done subtasks / done work blocks are excluded** from the deliverable's
    est (they were billed at completion). Projects-tab cohesion: `_type:
    'team'` rows now render owners with `delegateTagsHtml` (same ↗/📌 person
    pills as tagged items, next to the 👤 icon) — and `ti.name`/`ti.waiting`
    are now `escHtml`-escaped there (pre-existing XSS sink, newly reachable
    via hand-off, since arbitrary task names flow into `wt_team`).
26. **Cockpit chips: Blocked removed, Waiting wired to every row type** — the
    per-person board's 🚫 Blocked filter chip is gone (blocked cards already
    fold into In Progress with their 🚫 badge, and the toolbar status filter
    still has a Blocked option for isolating them). The ⏳ Waiting chip's
    count/filter read `i.waiting`, but the composite rows `renderTeam()`
    builds for delegated tasks, sessions, and subtasks didn't carry the
    field — their waiting-on notes were invisible to the chip, the board
    cards, and the list rows. All three composites now pass `waiting`
    through, so the chip counts them and the ⏳ badge shows on their cards.
27. **Pass-modal "Bills to" fixed** — it always showed "—" because the code
    set `.textContent` on an `<input>` (only `.value` renders), and when it
    would have shown something it joined the raw sub-code **id** instead of
    the label. Now: `projLabel(project) · getSubCodeLabel(...)`, set via
    `.value`. Still read-only by design (invariant: one billing code per
    deliverable — legs bill to the deliverable's project+subCode, changed in
    its edit modal, never per-pass).
28. **Board sort toggle + solo-card baton echo** — the board grew a Sort
    control (`_teamBoardSort`, `wt_team_board_sort`, device-local like
    `wt_team_view`): 🗂 **Project** keeps the existing grouped-with-headers
    order; 📅 **Due date** renders each column flat, nearest `_effTeamDue`
    first (stage-aware, undated last, priority tie-break), with a small
    project name + color dot line on every card replacing the headers. Also: on a person's own
    board, a non-relay card they solely own no longer shows the "◖ X's turn"
    baton line — "Solo" plus "X's turn" on X's board was the same fact twice
    (the line still shows when co-owners exist or the holder is someone
    else; the Everyone board is unchanged).
29. **Meetings column: no status badge at all** — meeting cards routed to
    the Meetings column carried their underlying status as a pill
    ("Delegate" by default), which is noise: the column is priority-routed
    and meetings don't need a settable status. Active meeting-priority
    cards render NO status badge (initially only the need-delegate default
    was hidden; per follow-up, blocked etc. are hidden too — a meeting has
    no status). A completed meeting sits in the Complete column with its
    Complete badge like any other card.
30. **Allocation horizon opened up** — the person-allocation modal was
    hard-capped at current + 6 months (2027 planning dead-ended in
    mid-2026). Now: rolling 12 months by default, a repeatable **+ 6 more
    months** extender (`_paMonthsExtra`, reset per open, typed values
    preserved across extends), and `_paMonthList` always unions in any
    FUTURE month that already holds an allocation for the person — so an
    allocation budgeted 20 months out can never fall out of the editable
    list. Everything else already reached 2027+: Capacity and Allocations
    have unbounded year nav, the cockpit ‹ › month nav and the Timesheet
    anchor are unbounded.
31. **Future Me legs hold in Capacity** — staged baton passes used to be
    invisible to personal planning until each leg became current (real
    pickle: three reviews landed at once with no time saved for them).
    `plannedItems()` now emits a synthetic entry (`_relayFuture: true`,
    `_src: 'relayleg'`, `_teamId`) for every Me stage STRICTLY AFTER the
    baton on an in-flight relay, dated `stage.due || item.due` (undated
    legs stay uncounted until active, when the mirror's current-month hold
    picks them up). Exactly-once accounting holds because those legs have
    no mirror yet — as each becomes current, `_syncBatonMirror` creates the
    mirror and the synthetic entry retires (`i <= relayIdx` exclusion).
    Consequence: hand-offs now reserve your review time the moment they're
    created. `save('wt_team')` invalidates the planned cache (it didn't
    before — wt_team never fed plannedItems). Capacity drill-down renders
    these rows with a ◖ "upcoming leg" chip; the only action is opening the
    deliverable (dates/hours live on the relay stage). Suite scenarios
    04/05 pin the before/after and the mirror-takeover no-double-count.

- **2026-07-15 — zero-billable close-out (billing convention, not a relay
  change).** The completion modal no longer clamps a typed 0 up to 0.25h
  (`confirmComplete` was planting phantom quarter-hour entries in
  `wt_completed`). Zero now means "bill nothing" everywhere, matching what
  `_logRelayLeg` always did: a KME mirror checkbox-completed at 0h archives
  a 0h entry and still advances the relay with 0 extra hours (invariant
  unchanged); relayLog pass hours record whatever was actually billed,
  including 0. The 0.25 floor still applies to hours > 0. Suite scenario 11.

- **2026-07-15 — baton↔mirror lifecycle audit (user report: "baton pass not
  showing up in My Tasks").** Passing/advancing was correct; the drift came
  from lifecycle paths that bypassed the mirror rules, and once linkage
  drifted nothing ever repaired it. Fixed on both sides:
  (1) every complete-path now closes the Me-leg mirror — `deleteTeamItem`
  (removes the open mirror outright, undo restores both), the project
  close-out bulk complete, the person-status roll-up (`applyOverall`), and
  `saveEditTeamItem`'s non-relay status save (the status dropdown already
  did); (2) completing a NON-relay baton mirror in My Tasks now records
  `ownerStatus/ownerStatusAt['Me']` on the deliverable and completes it when
  every owner resolves complete (it previously left the deliverable stuck
  on "Me"); (3) `_auditBatonMirrors()` runs at every app init: an in-flight
  relay whose current stage is Me gets its missing/closed mirror re-created,
  and any open mirror whose deliverable is gone, complete, or no longer on a
  Me leg is closed — with a "Baton sync" toast naming what moved; (4) baton
  arrival is now announced — `relayAdvance` to a Me leg and a relay saved
  with a current Me leg toast that the leg is in My Tasks (hours + due);
  deleting a mirror task warns that the baton is still on the deliverable
  and re-mirrors on next load. Suite scenario 14 pins all of it.

- **2026-07-15 — mirror edit routing + end-of-chain pass affordances (user
  report: "clicking a deliverable in My Tasks doesn't give the modal with
  the correct edits; no pass option at the end of the line").**
  `openEditModal` on a task with `_deliverableId` now redirects to
  `openEditTeamModal` — the mirror's meaningful fields (stage est/due/
  assignees, billing code) live on the relay, and one-way sync means task-
  modal edits were silently overwritten. This applies everywhere a mirror's
  name/Edit is clicked (My Tasks, week planner, Timesheet, Capacity,
  Projects); inline pickers on the row still handle personal placement.
  End-of-chain: the My Tasks **Pass → chip renders only when a next stage
  exists** (title names the recipient); the board card and edit-modal strip
  relabel to **✓ Finish**; and the pass prompt becomes "Finish the relay /
  Log & finish ✓" with the last-leg explanation. The ✓ checkbox remains the
  canonical way to log-and-close the final leg (invariant #3 unchanged).
