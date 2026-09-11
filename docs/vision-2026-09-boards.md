# Vision — Boards, project dash, timeline, Capacity 2.0 (Sep 2026 draft)

Status: **draft for discussion**. Written from the owner's reflection (Sep 11,
2026) plus a read of the current code. Nothing here is built. Open questions
are listed at the end; the phases will change once they are answered.

## The reflection, played back

- The **Projects tab is never used** because it presents everything at once:
  a project-code list on the left and, on the right, every task, session,
  subtask, work block, and deliverable grouped into per-sub-code tables
  (`renderProjCodeContent`). It is a *ledger* view. It has no place for a
  thought, a theme, a meeting note, or an intention — there is not even a
  free-text field on a project (`wt_projects_meta` holds label, color,
  billing code, sub-codes, tags; nothing else).
- The owner's real working material is a **web of connected thoughts per
  program**, scattered across chat conversations and paper. Those threads
  never re-converge. There is no "drop spot" in the app.
- Wanted: a **sliding whiteboard** metaphor (one board per program, slide to
  the next), notes that can be tossed on and moved around, iPad pen input,
  and possibly integration with an existing whiteboard app.
- Wanted: **tasks and meeting notes living inside that web**, with a
  sub-project card/header that shows the next deadline of its items.
- Wanted: a **dash** that shows status across all programs at a glance, then
  drills into the flow of one program and its sub-projects — possibly a
  **Gantt/timeline** showing progress, who is on it, and cross-program
  overlap.
- **Capacity** (time available vs deadlines vs allocations) is not yet a
  planning-and-delegating instrument. Today it lives in three tabs that do
  not converge: Capacity (personal headroom, one global hours-per-day),
  Allocations (budget vs actual per code per month), and the person boards
  (per-person allocation meters, weekly caps in `wt_person_capacity`).
- What already works and must not be disturbed: the timesheet import/audit,
  quick capture → inbox, checkbox completion as a provisional time stamp.

## Design principles carried over from the ADHD ergonomics layer

1. **Capture is one field, zero decisions.** A board must accept a thought as
   fast as the quick-capture box accepts a task.
2. **Never fully hide.** Boards can be slid away but the map of boards stays
   on screen (a strip of board tabs/thumbnails). Same rule as focus-mode
   stubs.
3. **One home for hours.** Board cards never carry hours. A card that
   becomes a task *links* to the task; the task keeps the estimate, the
   dates, and the billing code. This keeps every Capacity/Timesheet
   invariant untouched.
4. **Programs stay delineated by billing code.** Board = project code by
   default. Cross-code thinking gets a "loose thoughts" board rather than
   breaking the code boundary.

## Candidate architecture (assumes native boards; see Q1–Q3)

### New store: `wt_boards` (in `SYNC_KEYS`)

```
board = { id, projKey | null, title, order, cards: [card], createdAt }
card  = {
  id, kind: 'note' | 'heading' | 'meeting' | 'ref' | 'link',
  x, y, w, h, color,
  text,                 // note / heading / meeting body (escHtml at render)
  date,                 // meeting cards
  ref: { type: 'task' | 'team' | 'session' | 'subtask', id, projId?, sessionId? },
  url,                  // link cards (external whiteboard, doc)
  createdAt, updatedAt
}
```

- `ref` cards render **live** from the linked item (name, due, status, baton
  holder, priority) — no copied fields, so nothing drifts.
- Ink, if built, is a separate per-board blob (see Phase 3) because stroke
  data is large and must not bloat the `wt_boards` write on every card move.

### Tab shape

Replace the Projects tab's default view with **Boards**; the existing
per-sub-code ledger becomes a drill-in ("☰ List" toggle) rather than a
separate tab. Rationale: a seventh tab is one more thing to absorb; the
ledger is still useful for bulk sub-code moves and close-outs.

Layout:

```
[ dash strip: one header card per program — status, next deadline, open n, baton, budget burn ]
[ board strip: ◀ board tabs / thumbnails ▶ ]          ← slide, never hide
[ the board: free-position cards; drop zone; sub-project headers with next-due rollup ]
[ ☰ List (existing renderProjCodeContent) ]
```

## Phases

Each phase ships on its own and is useful alone. Order is a proposal.

### Phase 0 — Boards with sticky cards (the drop spot)
- `wt_boards`, one auto-created board per active project code plus a
  "Loose thoughts" board (`projKey: null`).
- Free-positioned cards (mouse drag + touch/pointer drag), resize, color,
  heading cards, delete, z-order.
- A one-line capture box at the top of every board ("toss it on"). Enter =
  new note card at the next free spot. Same zero-decision rule as the inbox.
- Slide between boards: arrow buttons, ←/→ keys, horizontal swipe on touch.
- Board list is device-independent (synced); *which board is open* is
  device-local (`wt_board_open`), same rule as `wt_team_board_person`.
- XSS: card text and titles are user text → `escHtml` at every sink;
  card ids only in handlers (never text).
- Verify scenario: cards persist/sync, escaping, capture creates a card, a
  board per project code exists after init.

### Phase 1 — Tasks in the web
- **Promote a card → task**: creates a `wt_tasks` item pre-filled with the
  board's project, `inbox: true` (so it triages through the normal path and
  cannot pollute Capacity before it has a date/estimate), and converts the
  card to `kind: 'ref'`.
- **Drop an existing item onto a board**: from the ☰ list or the My Tasks
  row menu ("📌 Pin to board"). Creates a `ref` card.
- `ref` cards show live due/status/owner and open the item's normal edit
  modal on click (mirror tasks still redirect to the deliverable editor —
  invariant #5 holds because the card just calls `openEditModal`).
- **Sub-project header cards**: a heading card with a sub-code (or a free
  label) rolls up its *linked* items — next deadline, open count, baton
  holders. Membership = cards within the header's rectangle (spatial, like a
  real whiteboard) rather than a new grouping field.
- Meeting cards: `kind: 'meeting'` with a date; "select text → make task"
  keeps the card as the task's origin (`ref` back-link stored on the task as
  `_boardCard`). Optional later: revive the disabled Brain Dump path
  (`submitBrainDump`, needs the device-local Anthropic key) to extract tasks
  from a meeting card with AI. The manual path must work without it.

### Phase 2 — Program dash (the "better dash")
- Header cards across the top: one per active program. Contents (to be
  confirmed in Q6): status color, next deadline + what it is, open items,
  who holds batons, allocation burn for the month (from `wt_allocations` +
  `wt_completed`, same math `_renderAllocReconcile` uses).
- Click = slide to that board. This also becomes the natural landing view
  for the tab.

### Phase 3 — Ink layer for the iPad (optional, decide in Q2)
- Pointer Events (`pointerType === 'pen'`, pressure), strokes as simplified
  polylines rendered to SVG behind the cards.
- Storage: one key per board (`wt_ink_<boardId>`). `SYNC_KEYS` is a static
  list, so the sync layer needs a small extension to a **key prefix** rule.
  Budget: localStorage is ~5 MB total per origin, so strokes are simplified
  on save and each board carries a soft cap with a warning. This is the
  phase with the most technical risk in a single-file, no-dependency app.
- Alternative (cheaper): `kind: 'link'` cards embedding an external board
  (see the integration note below). Both can coexist.

### Phase 4 — Timeline / Gantt
- Month-scale horizontal timeline; rows = program → sub-code → dated items
  (tasks, work blocks, sessions, deliverables). Relay deliverables draw as
  **segmented bars** — one segment per stage in the assignee's person color,
  the current stage outlined — because stage due dates and assignees already
  exist (`relay[]`).
- Data gap: nothing has a **start date**. Proposal: start = `workDate` if
  set, else `due − est / tsCapacity` working days; drawn with a dashed left
  edge so derived starts look derived. Confirm in Q7 before building.
- Undated items and month holds render in a "no date" gutter for the row —
  visible, never hidden.
- Cross-program overlap = rows stacked in one view with a "today" line and
  the week's capacity fill as a faint background band.
- The timeline reads `plannedItems()` output and never writes; moving a bar
  routes through `capMoveItem` / `_capAssignOne` (Math invariant #3, #9).

### Phase 5 — Capacity 2.0 (shape depends on Q9)
Bring three ledgers into one monthly planning view:
- **My time**: working days × hours/day, minus overhead and PTO (today there
  is no way to say "I'm out the 14th–18th" or "meetings take 10 h/week").
- **Deadlines**: what is due in the month, by program, with the relay legs
  that will land on Me (already modelled as `_relayFuture`).
- **Allocations**: budgeted hours per code for the month vs planned + logged
  (the Reconcile view's math, moved into the planning surface).
- **Team room**: per-person weekly cap × weeks − their planned stage hours,
  so "who can take this" is answered next to "I can't".
- Output: a per-program line "you: N h planned of M allocated, deadline X,
  headroom Y; delegate candidates: A (12 h free), B (4 h free)". Delegation
  actions reuse `capDelegateItem` / hand-off — no new billing paths.

## External whiteboard integration — honest assessment

I am **not certain** of the current state of any vendor's embed or API, so
verify before relying on any of this:

- **Miro** and **FigJam** both offer iframe embeds of a board, as far as I
  know. An embed needs nothing more than a `link` card holding the URL and
  an `<iframe>`; the app has no CSP that would block it. That is the
  cheapest integration and gives real pen input via the vendor's iPad app.
  Downside: the app cannot see what is on the board, so no card ↔ task
  linking, no search, no offline.
- **Microsoft Whiteboard / OneNote**: I do not know of a public embed or
  read API for Whiteboard content. OneNote has a Graph API but it needs an
  OAuth flow, which is a large addition to a single-file app.
- **Apple Freeform / GoodNotes / Notability**: no web API that I know of.
- **Excalidraw / tldraw** (open-source drawing libraries): both are
  React-based and heavy. Loading them via a pinned, SRI-hashed CDN script is
  possible in principle, but the bundle shapes change between versions —
  verify against current docs before choosing this route. A native
  Pointer-Events ink layer (Phase 3) avoids the dependency entirely.
- **Microsoft To Do / Tasks**: a two-way sync needs Graph OAuth. A one-way
  *import* from an exported file is feasible and matches the timesheet
  import pattern. Decide whether the goal is "replace" or "sync" (Q8).

## Open questions (answers reshape the phases)

1. **What goes on your whiteboard?** Rank: typed sticky notes, handwritten
   ink, arrows/connections between notes, pasted screenshots/images.
2. **Handwriting**: keep ink as ink, or do you want it as text? Which iPad
   app do you write in today?
3. **Existing whiteboard tools**: which do you already have (Miro, FigJam,
   Microsoft Whiteboard, Freeform)? Is "link/embed an external board per
   program" acceptable, or does the thinking need to live in the tracker?
4. **Board unit**: one board per project code, per sub-code, or per theme?
   Roughly how many active programs?
5. **Meeting notes**: where do they originate (Teams, OneNote, paper)? Should
   a meeting be a dated card on the program's board, with tasks pulled out
   of it linking back?
6. **The dash**: for one program at a glance, which three matter most —
   next deadline, status color, baton holder, open count, budget burned,
   my planned hours this month?
7. **Timeline**: bars for programs, sub-codes, or individual items? Would
   you enter start dates, or accept derived starts?
8. **Microsoft Tasks**: still in use? Goal is replace or sync?
9. **Capacity — which question is it failing to answer?** "Can I fit X by
   date?", "Which program will blow its allocation?", "Who has room to take
   this?", "What should I delegate this week?" And what makes today's number
   wrong: meetings/overhead not counted, PTO, undated items, allocations
   not reflected?
10. **Sub-project** = billing sub-code, or a thematic grouping that can
    cross codes?
