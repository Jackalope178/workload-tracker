// Meeting boards + In my court (Sep 2026): every meeting-priority task on a
// program is a doorway — the command panel lists them (title + date) beside
// the sub-code tiles; clicking one opens a board owned by that meeting,
// created on first open; past meetings fold behind "Past (n)"; a board whose
// meeting task was deleted stays reachable under Past while it has cards;
// meeting boards never appear as sub-code tiles; the My Tasks row of a
// meeting carries a 📅💭 chip straight to its board. Above a sub-code board,
// ◖ In my court lists deliverables whose baton is Me on that code until
// they are pinned.
const { launch, step, done } = require('./_lib');

const pad = n => String(n).padStart(2, '0');
const ds = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const off = n => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + n); return ds(d); };

(async () => {
  const { browser, page } = await launch({
    wt_active_tab: 'projects',
    wt_proj_view: '"boards"',
    wt_persons: ['Jordan K'],
    wt_projects_meta: { pa: { label: 'Prog A', color: '#4a7', billingCode: 'T-1', subCodes: [{ id: 'sc1', code: '1', label: 'Design' }] } },
    wt_tasks: [
      { id: '_m1', name: 'Board meeting', project: 'pa', subCode: 'sc1', priority: 'meeting', due: off(5), est: 1, completed: false, timer: 0, timerStart: null },
      { id: '_m2', name: 'Kickoff (last week)', project: 'pa', subCode: 'sc1', priority: 'meeting', due: off(-7), est: 1, completed: true, timer: 0, timerStart: null },
      { id: '_m3', name: 'Undated sync', project: 'pa', subCode: '', priority: 'meeting', due: '', est: 1, completed: false, timer: 0, timerStart: null },
      { id: '_t1', name: 'Not a meeting', project: 'pa', subCode: 'sc1', priority: 'med', due: off(3), est: 1, completed: false, timer: 0, timerStart: null }
    ],
    wt_boards: [{ id: '_bOrphan', projKey: 'pa', scId: 'sc1', meetingTaskId: '_gone', title: 'Old retro', date: off(-30), createdAt: off(-30) }],
    wt_board_cards: [{ id: '_c1', boardId: '_bOrphan', kind: 'note', x: 16, y: 16, w: 200, h: 140, color: 'yellow', z: 1, text: 'kept note', urgent: null, important: null }],
    wt_team: [
      { id: '_d1', name: 'Relay at my review', owner: 'Jordan K', owners: ['Jordan K'], project: 'pa', subCode: 'sc1', due: off(20), status: 'in-review', est: 6, relay: [{ kind: 'work', who: 'Jordan K', est: 4, due: off(10) }, { kind: 'review', who: 'Me', est: 2, due: off(20) }], relayStage: 1, activeOwner: 'Me' },
      { id: '_d2', name: 'With Jordan', owner: 'Jordan K', owners: ['Jordan K'], project: 'pa', subCode: 'sc1', due: off(20), status: 'in-progress', est: 3, activeOwner: 'Jordan K' }
    ]
  });

  // 1. Meetings list: upcoming first, undated included, past folded, orphan under past.
  let r = await page.evaluate(() => {
    _switchTab(document.querySelector('.tab[data-tab="projects"]'));
    selectProjCode('pa');
    const m = _projMeetings('pa');
    const rows = [...document.querySelectorAll('.board-meetings .board-meet-row')].map(e => e.querySelector('.board-meet-name').textContent.trim());
    const tiles = [...document.querySelectorAll('.board-strip .sig-tile .sig-tile-title')].map(e => e.textContent);
    return { up: m.up.map(x => x.name), past: m.past.map(x => x.name), rows, pastBtn: document.querySelector('.board-meet-past')?.textContent, tiles };
  });
  step('upcoming meetings listed by date (undated last); past + deleted-meeting boards fold behind Past', r.up.join('|') === 'Board meeting|Undated sync' && r.past.join('|') === 'Kickoff (last week)|Old retro' && r.rows.join('|') === 'Board meeting|Undated sync' && (r.pastBtn || '').includes('Past (2)'), r);
  step('meeting boards never appear as sub-code tiles', r.tiles.join('|') === '💭 Loose thoughts|1 Design', r.tiles);

  // 2. Clicking a meeting opens its own board, created on first open; not a sub-code board; slide → back to sub-code boards.
  r = await page.evaluate(() => {
    const before = boards.length;
    boardOpenMeeting('pa', '_m1');
    const b = _boardCurrent('pa');
    const title = document.querySelector('.board-head-title')?.textContent || '';
    const inp = document.getElementById('boardCapture'); inp.value = 'Bring: ask about budget'; inp.form.requestSubmit();
    const n = boardCards.filter(c => c.boardId === b.id).length;
    const active = document.querySelector('.board-meet-row.active .board-meet-name')?.textContent.trim();
    boardOpenMeeting('pa', '_m1');
    const again = boards.length;
    boardSlide('pa', 1);
    const afterSlide = _boardCurrent('pa');
    return { created: boards.length === before + 1, again: again === before + 1, meetingBoard: b.meetingTaskId === '_m1', title, inTiles: _boardsForProject('pa').some(x => x.id === b.id), n, active, slideTo: afterSlide.scId, slideNotMeeting: !afterSlide.meetingTaskId, stored: JSON.parse(localStorage.getItem('wt_boards')).some(x => x.meetingTaskId === '_m1') };
  });
  step('opening a meeting creates its board once, titled with date + name, listed as active, capture works on it', r.created && r.again && r.meetingBoard && r.title.includes('Board meeting') && r.title.includes('📅') && !r.inTiles && r.n === 1 && r.active === 'Board meeting' && r.stored, r);
  step('→ from a meeting board lands on the first sub-code board', r.slideTo === '' && r.slideNotMeeting, r);

  // 3. Past toggle reveals past + orphan; orphan opens with its kept note.
  r = await page.evaluate(() => {
    _boardTogglePast('pa');
    const rows = [...document.querySelectorAll('.board-meetings .board-meet-row')].map(e => e.querySelector('.board-meet-name').textContent.trim());
    boardOpenMeeting('pa', null, '_bOrphan');
    const cur = _boardCurrent('pa');
    const note = document.querySelector('.bcard[data-card-id="_c1"] .bc-text')?.textContent;
    return { rows, cur: cur.id, note, title: document.querySelector('.board-head-title')?.textContent };
  });
  step('Past (n) unfolds the past meetings; a deleted meeting\'s board still opens with its notes', r.rows.length === 4 && r.rows.includes('Old retro (deleted)') && r.cur === '_bOrphan' && r.note === 'kept note' && (r.title || '').includes('Old retro'), r);

  // 4. In my court tray on the sub-code board; pinning removes the chip.
  r = await page.evaluate(() => {
    const sc1 = _boardsForProject('pa').find(b => b.scId === 'sc1');
    boardOpen('pa', sc1.id);
    const chips = [...document.querySelectorAll('.board-court-chip')].map(e => e.textContent.trim());
    boardPinItem('team', '_d1');
    const after = document.querySelectorAll('.board-court-chip').length;
    const pinned = boardCards.some(c => c.boardId === sc1.id && c.kind === 'ref' && c.ref.id === '_d1');
    const loose = _boardsForProject('pa').find(b => b.scId === '');
    boardOpen('pa', loose.id);
    const looseTray = !!document.querySelector('.board-court');
    return { chips, after, pinned, looseTray };
  });
  step('◖ In my court lists only deliverables whose baton is Me on this code (with the current leg + due)', r.chips.length === 1 && r.chips[0].includes('Relay at my review') && r.chips[0].includes('Review') && !r.chips[0].includes('With Jordan'), r.chips);
  step('📌 on a court chip pins it as a linked card and the chip leaves the tray; a code with nothing in my court shows no tray', r.after === 0 && r.pinned && !r.looseTray, r);

  // 5. My Tasks: the meeting row carries a 📅💭 chip that jumps onto the meeting board.
  r = await page.evaluate(() => {
    _switchTab(document.querySelector('.tab[data-tab="tasks"]'));
    const row = document.querySelector('.task-row[data-id="_m1"]');
    const chip = row && row.querySelector('.board-origin-chip.meet');
    const plainRow = document.querySelector('.task-row[data-id="_t1"]');
    const plainChip = plainRow && plainRow.querySelector('.board-origin-chip');
    if (chip) chip.click();
    return { chip: !!chip, chipCount: chip && chip.textContent.includes('1'), plainChip: !!plainChip, tab: document.querySelector('.tab.active').dataset.tab, view: _projView, sel: selectedProjCode, cur: _boardCurrent('pa').meetingTaskId };
  });
  step('📅💭 on the meeting row (with its sticky count) opens that meeting\'s board; ordinary rows get no chip', r.chip && r.chipCount && !r.plainChip && r.tab === 'projects' && r.view === 'boards' && r.sel === 'pa' && r.cur === '_m1', r);

  await done(browser);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
