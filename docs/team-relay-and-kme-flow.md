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
- `relay`: `[{ id, kind, who, est, due }]` — `kind ∈ work | review | send`.
  (No per-stage label — removed by design; type + person convey the leg.)
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
- **Undated legs don't reach Capacity.** `plannedItems()` needs a `due` (or
  `allocMonth`). Set per-leg due dates so KME legs count forward. *(Mitigated:
  per-leg due is supported in the relay editor.)*
- **Relay → mirror is one-way.** Editing the mirror task does not update the
  relay stage.
- **One billing code per deliverable.** All legs bill to the deliverable's
  `project`+`subCode`; stages don't carry their own code.
- **Two representations by design.** A KME relay item appears on the KME team
  board *and* as a My-Tasks mirror (team-side vs personal-side). Not additive
  across meters: the team cockpit gauge uses stage `est` (`_relayPersonEst`);
  Capacity uses the mirror task.
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
