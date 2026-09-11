# Vision — Boards, command panel, timeline, Capacity 2.0 (Sep 2026)

Status: **Phases 0–4 shipped (Sep 11, 2026)** — boards, stickies,
capture box, slide strip, ⊞ Sort 2×2, save-state chip (scenario 22);
promote-to-task, 📌 pin, live linked cards, spatial heading rollups, meeting
cards with ✂ Task from selection, 💭 back-links, `createdAt` stamping
(scenario 23); ⌂ Dash landing view + command-panel tiles driven by
`_projSignals` (scenario 24); ⏩ forward fill + what-if + time off/overhead +
📅 Plan on the Capacity tab (scenario 25); ▬ Timeline with bars, relay
segments, dependencies, chips for undated/held rows and the load band
(scenario 26). Revised the same day after the owner answered the ten open
questions (answers folded in below). Phase 5 (ink) and Phase 6 (team room
in the schedule) remain; both will be re-cut before building.

**Phase 4 as built, where it differs from the plan below:** the timeline
is a fourth segment of the Projects view toggle (⌂ Dash · ▬ Timeline · ▦
Boards · ☰ List) rather than a separate tab; the scale is a fixed 4 px per
day with a horizontally scrolling, sticky-labelled grid; moving a bar is
the row's ⇄ button (the existing month-move), not drag; `dependsOn` is set
in the task form's 📅 section ("After") next to a new "Start" field and is
read by nothing but the timeline; the load band is per day in the header
rather than a band behind rows.

**Phase 3 as built, where it differs from the plan below:** time off and
overhead feed **only the forward fill**, not the month bars or Timesheet
targets — leave is billed to its own code in this org (Employee Leave /
Holidays), so subtracting days from those lenses would double-count once
the leave hours are logged; the fill horizon is ~26 weeks; overdue items
come from the raw arrays (a wide backward `plannedItems` window would
expand every recurrence for years); 📅 Plan commits via work date + spread
rather than generating work blocks.

**Phase 2 as built, where it differs from the plan below:** the dash is a
third segment of the view toggle (⌂ Dash · ▦ Boards · ☰ List) and the
default landing; the command panel replaces the board strip with tiles
(▴ collapses them back to chips, device-local); quiet programs (nothing
open, no hours, no batons this month) compress into a chip row rather than
rendering as full tiles; a program tile's status colour comes from a fixed
attention order (overdue > over budget > blocked > to delegate > waiting >
inbox) rather than "worst sub-code".

**Owner verification checklist (on the iPad, once merged and live):**
Apple Pencil tap-to-edit and drag on stickies; drag between the 2×2 boxes;
Scribble handwriting into the capture box and the sticky editor; ✂ Task
from selection keeping the text selection in Safari.

**Phase 1 as built, where it differs from the plan below:** promotion is a
⋯ menu action on a sticky (not a drag), and from the Delegate box it opens
the new task's modal on the 👥 Team section rather than a separate picker;
📌 lives on task / work-item / subtask / deliverable rows in ☰ List and on
My Tasks rows; the AI path for meeting cards stays out entirely (Copilot-
only constraint) — ✂ Task from selection is the whole mechanism; a deleted
linked item leaves a dashed card with ⋯ Unlink rather than vanishing.

**Phase 0 as built, where it differs from the plan below:** cards live in a
flat `wt_board_cards` array keyed by `boardId` (not nested in the board);
the project's unfiled board is labelled **💭 Loose thoughts**; the Projects
tab keeps its left-hand project-code list as the "which program" chooser,
with ▦ Boards / ☰ List as a toggle on the right panel (the command-panel
tiles arrive in Phase 2); ←/→ keys and a swipe on the board title slide
between boards, with no wrap-around at the ends; `save()` now returns its
cloud promise so the save chip can report synced / device-only / failed.

## The reflection, played back

- The **Projects tab is never used** because it presents everything at once:
  a project-code list on the left and, on the right, every task, session,
  subtask, work block, and deliverable in per-sub-code tables
  (`renderProjCodeContent`). It is a *ledger*. It has no place for a thought,
  a theme, a meeting note, or an intention — a project has no free-text
  field at all (`wt_projects_meta`: label, color, billing code, sub-codes,
  tags).
- The owner's real working material is a **web of connected thoughts per
  program**, scattered across Loop, chat, Apple Notes and GoodNotes. Those
  threads never re-converge. There is no drop spot in the app.
- The **hardest planning problem is fitting work into the calendar**: several
  programs, each a span of time with hours to sprinkle until a deadline.
  "Do you have time for X?" has no answer today because nothing shows how
  booked the coming weeks are or when a new item could realistically land.
- What already works and must not be disturbed: timesheet import/audit,
  quick capture → inbox, checkbox completion as a provisional time stamp,
  the relay/baton chain, work blocks and spread plans.

## Decisions taken (from the Q&A)

| # | Decision |
|---|---|
| 1 | **Typed stickies**, with a second view that sorts a board's cards into the urgent/important 2×2 grid. |
| 2 | **No handwriting-to-text conversion in the app.** On iPad, typed cards accept handwriting through the OS (iPadOS Scribble writes into ordinary web text fields — verify on your device). Ink stays ink: an optional ink card/layer later, never OCR. |
| 3 | **Build internally.** Scope is viable (see "Is an internal whiteboard viable?"). Canva stays an option only as a linked/embedded design, not the thinking surface. |
| 4 | **Hierarchy = billing hierarchy.** Project code → **command panel** → one board per **sub-code** (task code). Sub-sub-projects are groups (heading cards) inside the sub-code board; they never leave the billable zone. |
| 5 | **Meeting notes come from Microsoft Loop.** No public API I can rely on, so pairing = paste into a dated meeting card that keeps the Loop page link. Data-trust concerns are answered with visible per-board save state and Supabase-side backups (paid tier now available; verify what the plan includes). |
| 6 | **Per-sub-project top three:** burn vs planned ratio, *my* next deadline or the sub-project that needs attention, baton holder (per item, rolled up). |
| 7 | **Timeline bars derive their start from the entry date**, with an optional explicit start date or a dependency on another item. Tasks carry no entry date today, so a `createdAt` stamp is added going forward. |
| 8 | **Microsoft To Do/Tasks: pinned.** End goal is a sync without double entry; AI in the work ecosystem is limited to the built-in Copilot, so nothing in the tracker may depend on an AI call. Structural allowance now: a reserved `ext` slot on items for a future provider id — nothing else. |
| 9 | **Capacity 2.0 = a forward-fill schedule** that answers "how booked am I, and when could X land?" |
| 10 | Sub-project = sub-code. Confirmed. |

## Design principles carried over from the ADHD ergonomics layer

1. **Capture is one field, zero decisions.** A board accepts a thought as
   fast as the quick-capture box accepts a task.
2. **Never fully hide.** Boards slide, but the strip of boards stays on
   screen (same rule as focus-mode stubs).
3. **One home for hours.** Cards never carry hours. A card that becomes a
   task *links* to it; the task keeps estimate, dates, and billing code.
   Every Capacity/Timesheet invariant stays untouched.
4. **Programs stay delineated by billing code.** Board = sub-code. Thinking
   that has no code yet goes on the project's own "unfiled" board and is
   filed when it becomes real.

## Is an internal whiteboard viable? (answer to Q3)

Yes, for the whiteboard *you described*. A sticky-note board is absolutely
positioned cards with pointer-event drag, resize, and z-order — ordinary DOM,
no canvas math, touch-friendly by construction. It fits the single-file,
no-dependency rule. My rough sizing (approximate, treat as a guess):

| Piece | Approx. lines (JS+CSS+HTML) | Risk |
|---|---|---|
| Boards, cards, capture box, slide strip, 2×2 grid view | 1,500–2,500 | low |
| Card ↔ task links, promote, pin, live rollups | 600–900 | low |
| Command panel + all-programs dash | 800–1,200 | low (reuses Reconcile math) |
| Ink layer (pen strokes to SVG) | 600–900 | medium (storage, iPad quirks) |
| Timeline | 1,000–1,500 | medium (derived starts, dependencies) |
| Forward-fill schedule + what-if | 700–1,000 | medium (must respect every placement invariant) |

What is **not** viable in this app and is not needed: an infinite vector
canvas with routed connectors, lasso transforms, or multi-user cursors. If
that ever matters, an embedded external board is the right tool.

## Architecture

### New store: `wt_boards` (add to `SYNC_KEYS`)

```
board = { id, projKey, scId | '',      // '' = the project's unfiled board
          title, order, view: 'free' | 'grid', createdAt }
card  = { id, boardId,
          kind: 'note' | 'heading' | 'meeting' | 'ref' | 'link',
          x, y, w, h, color, z,
          text,                          // escHtml at every render sink
          date,                          // meeting cards
          urgent, important,             // 2×2 grid placement; null = unsorted
          ref: { type: 'task'|'team'|'session'|'subtask', id, projId?, sessionId? },
          url,                           // link cards (Loop page, Canva design, doc)
          createdAt, updatedAt }
```

- Cards live in a flat `wt_board_cards` array keyed by `boardId`, so moving a
  card between boards is a field change and board deletion is a filter.
- `ref` cards render **live** from the linked item — no copied fields.
- **Device-local** (not synced): `wt_board_open` (which board is showing),
  `wt_board_view` per board. Same rule as `wt_team_board_person`.
- Ink and images, when built, go to **Supabase Storage** (paid tier), not to
  localStorage — one object per board, referenced by URL from the board
  record. Offline shows a placeholder. This keeps `wt_boards` small and the
  5 MB localStorage budget safe.
- Additions to existing items: `createdAt` (stamped on every create path
  from now on; missing on legacy items, which draw with no derived start),
  optional `start`, optional `dependsOn: itemId`, and a reserved `ext`
  slot. None of these affect any hours math.

### Tab shape

The Projects tab becomes **Programs** (name TBD). Three levels, each a
click deeper, the level above always visible as a breadcrumb strip:

```
[ all-programs dash: one tile per project code ]
        ↓ click
[ command panel for one project: one tile per sub-code — burn/planned ratio,
  my next deadline, needs-attention flag, baton holders ]      ← Q6 top three
        ↓ click
[ the sub-code board: ◀ slide ▶ between sibling boards; free view or 2×2 grid;
  capture box; heading cards for sub-sub-projects ]
        ↓ ☰ List
[ existing per-sub-code ledger (renderProjCodeContent) for bulk moves/close-outs ]
```

### The 2×2 grid view

Same cards, laid out into four quadrants by `urgent`/`important`. Drag
between quadrants sets the flags. Unsorted cards sit in a tray at the bottom
so nothing is hidden. When a card is promoted to a task the quadrant seeds
priority: urgent+important → `urgent`, important only → `high`, urgent only
→ `med` **and the card offers Assign-to / Hand-off first** (the "delegate"
quadrant maps straight onto the existing delegation SOP), neither → `low`.

## Phases

### Phase 0 — Boards with sticky cards (the drop spot)
- `wt_boards` / `wt_board_cards`; one board auto-created per active
  sub-code plus the project's unfiled board, on first visit.
- Cards: create, drag (pointer events, works with mouse, touch, pencil),
  resize, recolor, edit in place, delete, bring-to-front. Heading cards.
- Capture box at the top of every board. Enter = new card at the next free
  slot. `N` on the board focuses it (mirrors My Tasks).
- Slide between sibling boards: arrows, ←/→, horizontal swipe.
- 2×2 grid view toggle with the unsorted tray.
- Save state chip per board ("saved · synced ✓ / pending / failed") — the
  trust signal; failures also surface through the existing sync toast.
- Verify scenario: board per sub-code after init, capture creates a card,
  moves persist, escaping of card text and titles, grid flags round-trip.
- CLAUDE.md/README: new store, new device-local keys, tab rename, anchor
  table entries.

### Phase 1 — Tasks in the web
- **Promote card → task** (pre-filled project + sub-code, `inbox: true`,
  priority from quadrant, `createdAt` stamped; card becomes `ref`).
- **Pin an existing item to a board** from the ☰ list and from My Tasks /
  Team row menus.
- `ref` cards show live due, status, baton holder, priority; click opens the
  item's normal editor (mirror tasks still redirect to the deliverable
  editor — invariant #5 holds because the card just calls `openEditModal`).
- **Heading cards roll up** the linked cards inside their rectangle: next
  deadline, open count, baton holders. Spatial membership, no new grouping
  field.
- **Meeting cards**: dated, keep the Loop page URL, "paste from Loop"
  accepts rich text and keeps it as plain text. "Select text → make task"
  creates a linked task and stamps `_boardCard` on it so the origin is one
  click away.

### Phase 2 — Command panel and dash
- Sub-code tiles: **burn vs planned** (allocation for the month vs logged +
  planned, the `_renderAllocReconcile` math), **my next deadline** (or the
  needs-attention reason: overdue, blocked, waiting, unassigned, over
  allocation), **baton holders** rolled up from the sub-code's deliverables.
- Project tiles on the all-programs dash: the same three, rolled up, plus a
  status color derived from the worst sub-code.
- Becomes the tab's landing view.

### Phase 3 — Forward-fill schedule and what-if (Capacity 2.0, part 1)
This is the answer to Q9 and is deliberately ahead of ink and timeline.
- **Forward fill**: take every open planned item (tasks, blocks, sessions,
  subtasks, mirror legs, `_relayFuture` legs), keep anything with a pinned
  work date or spread where it is, and pack the rest earliest-deadline-first
  into future working days at `tsCapacity` per day — a generalisation of the
  existing `packIntoFreeDays`, which already packs *one* item first-fit.
- Read-only by default. It produces: **"Booked through <date>"**, a per-day
  fill strip for the next 8–12 weeks, the list of deadlines the fill cannot
  meet (late by N days), and per-program totals.
- **What-if box**: "N hours by <date>?" → yes/no, the earliest date it can
  land, and which existing deadlines it would push. Nothing is written.
- **Commit** (optional, per item): turn the suggested days into work blocks
  or a spread through `_capAssignOne` / `blkAutoFill` — never by writing
  dates directly (Math invariants #3, #8, #9). Recurring items are never
  re-placed (invariant #9).
- Inputs that make the number honest: **time off** (date ranges at 0 h) and
  a **weekly overhead** (meetings/admin hours subtracted from each week).
  New key `wt_time_off`, in `SYNC_KEYS`. Both also feed the existing Capacity
  month bars and Timesheet capacity so all lenses agree.
- Verify scenario: fill is deterministic, respects pinned dates, never
  exceeds daily capacity, never places on weekends/time-off, what-if never
  writes, commit writes only through the placement helpers.

### Phase 4 — Timeline
- Month-scale horizontal timeline: rows = project → sub-code → items.
  Relay deliverables draw as **segmented bars** (one segment per stage, in
  the assignee's person color, current stage outlined) — stage due dates and
  assignees already exist.
- Bar start = `start` if set, else `createdAt`, else none (legacy items draw
  as a deadline diamond only). `dependsOn` draws a link and the dependent
  bar starts no earlier than the predecessor's due date.
- Undated items and month holds sit in a "no date" gutter per row.
- A "today" line and the Phase 3 fill as a faint background band show
  cross-program crowding.
- Reads `plannedItems()`; moving a bar routes through `capMoveItem`.

### Phase 5 — Ink layer (iPad)
- Pointer Events with `pointerType === 'pen'` and pressure; strokes
  simplified and rendered to SVG behind the cards; one ink object per board
  in Supabase Storage.
- Verify Apple Pencil behaviour in iPadOS Safari on the real device before
  building — I am not certain of current pressure/palm-rejection behaviour
  in the browser.
- Optional `link` cards for Canva designs stay available regardless.

### Phase 6 — Team room inside the schedule (Capacity 2.0, part 2)
- Per-person weekly cap (`wt_person_capacity`) × weeks − their planned
  stage hours → "who can take this", shown next to the what-if answer, with
  Assign-to / Hand-off actions reusing `capDelegateItem` and the hand-off
  helpers. No new billing paths.

## Deferred / structural notes

- **Microsoft To Do sync**: pinned. Reserved `ext: { provider, id }` on
  items. A future one-way import from an exported file follows the
  timesheet-import pattern; true sync needs Graph OAuth and is a separate
  decision.
- **Loop**: no API dependency. Paste + link only.
- **AI**: nothing in these phases calls a model. The disabled Brain Dump
  path stays disabled.
- **Backups**: with the paid Supabase tier, confirm what backup/point-in-time
  recovery the plan includes and turn it on; add a "Download backup" reminder
  cadence in-app if it is not automatic. I do not have a verified source for
  the current plan contents.
