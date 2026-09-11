// Boards (Sep 2026, Phase 0 of docs/vision-2026-09-boards.md): the Projects
// tab's default view is one sticky-note board per sub-code plus a Loose
// thoughts board. Invariants: boards auto-exist per sub-code; capture is one
// field + Enter; new stickies never overlap; moves/edits/quadrant flags
// persist through wt_board_cards (synced) while view prefs stay device-local;
// card text is escHtml-escaped; delete is undoable; stickies carry no hours
// (plannedItems never sees them); ☰ List still renders the ledger.
const { launch, step, done } = require('./_lib');

(async () => {
  const { browser, page } = await launch({
    wt_active_tab: 'projects',
    wt_projects_meta: {
      proj1: { label: 'Board Proj', color: '#4a7', billingCode: 'T-26-009', subCodes: [
        { id: 'sc1', code: '1', label: 'Design' },
        { id: 'sc2', code: '2', label: 'Build' }
      ] }
    },
    wt_boards: [{ id: '_bX', projKey: 'proj1', scId: 'sc1', createdAt: '2026-09-01' }],
    wt_board_cards: [
      { id: '_c0', boardId: '_bX', kind: 'note', x: 16, y: 16, w: 200, h: 140, color: 'pink', z: 1,
        text: '<img src=x onerror="window.__boardXss=1"> & "quotes"', urgent: null, important: null,
        createdAt: '2026-09-01', updatedAt: '2026-09-01' }
    ],
    wt_tasks: [
      { id: '_t1', name: 'RealTask', project: 'proj1', subCode: 'sc1', priority: 'med', due: '2026-10-05', est: 2, completed: false, timer: 0, timerStart: null }
    ]
  });

  // 1. Boards exist per sub-code + Loose thoughts; view is Boards by default.
  let r = await page.evaluate(() => {
    _switchTab(document.querySelector('.tab[data-tab="projects"]'));
    const landing = _projView;                       // ⌂ Dash lands first (Phase 2)
    const dashShown = !!document.querySelector('.dash-grid');
    selectProjCode('proj1');                          // picking a program → its Boards
    const list = _boardsForProject('proj1');
    return {
      landing, dashShown,
      n: list.length,
      titles: list.map(_boardTitle),
      stored: JSON.parse(localStorage.getItem('wt_boards')).length,
      boardsShown: document.getElementById('projBoardsWrap').style.display !== 'none',
      listHidden: document.getElementById('projCodeContent').style.display === 'none',
      stripTabs: document.querySelectorAll('.board-strip .sig-tile, .board-strip .board-tab').length,
      synced: SYNC_KEYS.includes('wt_boards') && SYNC_KEYS.includes('wt_board_cards'),
      localOnly: !SYNC_KEYS.includes('wt_proj_view') && !SYNC_KEYS.includes('wt_board_open') && !SYNC_KEYS.includes('wt_board_view')
    };
  });
  step('one board per sub-code + Loose thoughts (3), persisted', r.n === 3 && r.stored === 3 && r.titles[0] === 'Loose thoughts' && r.titles[1] === '1 Design', r.titles);
  step('the tab lands on ⌂ Dash; picking a program opens its Boards', r.landing === 'dash' && r.dashShown && r.boardsShown && r.listHidden, r);
  step('the command panel shows a tile for every board', r.stripTabs === 3, r.stripTabs);
  step('wt_boards / wt_board_cards sync; view prefs are device-local', r.synced && r.localOnly, r);

  // 2. Seeded card renders escaped on its (sc1) board.
  r = await page.evaluate(() => {
    boardOpen('proj1', '_bX');
    const body = document.getElementById('boardBody');
    return {
      hasCard: !!body.querySelector('.bcard[data-card-id="_c0"]'),
      xssFired: window.__boardXss === 1,
      escaped: body.innerHTML.includes('&lt;img') && !body.querySelector('img'),
      amp: body.querySelector('.bcard[data-card-id="_c0"] .bc-text').textContent.includes('& "quotes"')
    };
  });
  step('card text is escHtml-escaped (no live <img>, entities round-trip)', r.hasCard && !r.xssFired && r.escaped && r.amp, r);

  // 3. Capture: one field + Enter → sticky on the open board, no overlap.
  r = await page.evaluate(() => {
    const inp = document.getElementById('boardCapture');
    inp.value = 'First thought';
    inp.form.requestSubmit();
    document.getElementById('boardCapture').value = 'Second thought';
    document.getElementById('boardCapture').form.requestSubmit();
    const cards = boardCards.filter(c => c.boardId === '_bX');
    const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    let anyOverlap = false;
    for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) if (overlap(cards[i], cards[j])) anyOverlap = true;
    return {
      n: cards.length,
      texts: cards.map(c => c.text),
      anyOverlap,
      inputCleared: document.getElementById('boardCapture').value === '',
      focused: document.activeElement && document.activeElement.id === 'boardCapture',
      stored: JSON.parse(localStorage.getItem('wt_board_cards')).length,
      stripCount: document.querySelector('.board-strip .sig-tile.active .board-tab-n, .board-strip .board-tab.active .board-tab-n').textContent,
      noHours: cards.every(c => c.est === undefined && c.hours === undefined)
    };
  });
  step('Enter adds a sticky to the open board, clears + refocuses the box', r.n === 3 && r.texts.includes('First thought') && r.texts.includes('Second thought') && r.inputCleared && r.focused, r);
  step('new stickies never overlap; count persists and shows on the strip tab', !r.anyOverlap && r.stored === 3 && r.stripCount === '3', r);
  step('stickies carry no hours', r.noHours);

  // 4. Stickies are invisible to every hours meter.
  r = await page.evaluate(() => {
    const p = plannedItems('2026-09-01', '2026-12-31');
    return { planned: p.length, names: p.map(x => x.name) };
  });
  step('plannedItems sees the real task only, never a sticky', r.planned === 1 && r.names[0] === 'RealTask', r);

  // 5. Move + edit persist; z rises to front.
  r = await page.evaluate(() => {
    const id = boardCards.find(c => c.text === 'First thought').id;
    _boardMoveCard(id, 313, 207);
    const c = boardCards.find(k => k.id === id);
    const stored = JSON.parse(localStorage.getItem('wt_board_cards')).find(k => k.id === id);
    const maxZ = Math.max(...boardCards.filter(k => k.boardId === '_bX').map(k => k.z));
    const el = document.querySelector(`.bcard[data-card-id="${id}"]`);
    return { x: stored.x, y: stored.y, front: c.z === maxZ, domLeft: el && el.style.left };
  });
  step('move persists (x/y) and brings the sticky to the front', r.x === 313 && r.y === 207 && r.front && r.domLeft === '313px', r);

  r = await page.evaluate(async () => {
    const id = boardCards.find(c => c.text === 'Second thought').id;
    boardCardEdit(id);
    const ta = document.querySelector(`.bcard[data-card-id="${id}"] textarea`);
    const editing = !!ta;
    ta.value = 'Second thought, sharpened';
    ta.blur();
    await new Promise(r => setTimeout(r, 50));
    return { editing, text: boardCards.find(k => k.id === id).text,
      stored: JSON.parse(localStorage.getItem('wt_board_cards')).find(k => k.id === id).text,
      rendered: document.querySelector(`.bcard[data-card-id="${id}"] .bc-text`).textContent };
  });
  step('tap-to-edit: blur saves the text and re-renders', r.editing && r.text === 'Second thought, sharpened' && r.stored === r.text && r.rendered === r.text, r);

  // 6. 2×2 sort view: quadrant flags persist; unsorted tray never hides cards.
  r = await page.evaluate(() => {
    boardSetView('_bX', 'grid');
    const id = boardCards.find(c => c.text === 'First thought').id;
    _boardSetQuadrant(id, 'steady');
    const c = boardCards.find(k => k.id === id);
    const body = document.getElementById('boardBody');
    const inQuad = q => [...body.querySelectorAll(`[data-quad="${q}"] .bcard`)].map(e => e.dataset.cardId);
    return {
      quads: body.querySelectorAll('.board-quad').length,
      flags: [c.urgent, c.important],
      inSteady: inQuad('steady').includes(id),
      trayCount: inQuad('tray').length,
      pref: JSON.parse(localStorage.getItem('wt_board_view'))['_bX'],
      quadOf: _boardQuadOf(c), bins: document.querySelectorAll('[data-quad="delegate"], [data-quad="tray"]').length
    };
  });
  step('Sort 2×2 renders four boxes + Ideas and Delegate bins; drop sets urgent/important and persists', r.quads === 4 && r.bins === 2 && r.flags[0] === true && r.flags[1] === false && r.inSteady && r.quadOf === 'steady', r);
  step('unsorted stickies wait in the tray (2), never hidden; view pref is per board', r.trayCount === 2 && r.pref === 'grid', r);

  r = await page.evaluate(() => {
    const id = boardCards.find(c => c.text === 'First thought').id;
    _boardSetQuadrant(id, 'tray');
    boardSetView('_bX', 'free');
    const c = boardCards.find(k => k.id === id);
    return { cleared: c.urgent === null && c.important === null, freeAgain: !!document.getElementById('boardCanvas') };
  });
  step('dragging back to the tray clears the flags', r.cleared && r.freeAgain, r);

  // 7. Slide: arrows / keys move between boards; open board is remembered per project (device-local).
  r = await page.evaluate(() => {
    const before = _boardCurrent('proj1').id;
    boardSlide('proj1', 1);
    const after = _boardCurrent('proj1').id;
    boardSlide('proj1', 1); boardSlide('proj1', 1); boardSlide('proj1', 1);
    const clamped = _boardCurrent('proj1').id;
    const list = _boardsForProject('proj1');
    return { moved: before !== after, atEnd: clamped === list[list.length - 1].id,
      remembered: JSON.parse(localStorage.getItem('wt_board_open')).proj1 === clamped,
      nextDisabled: [...document.querySelectorAll('.board-strip-arrow')][1].disabled,
      sideArrows: document.querySelectorAll('.board-side-arrow').length, sideNextDisabled: [...document.querySelectorAll('.board-side-arrow')][1].disabled, sidePrevEnabled: ![...document.querySelectorAll('.board-side-arrow')][0].disabled };
  });
  step('slide moves to the next board, clamps at the end, remembers the open board', r.moved && r.atEnd && r.remembered && r.nextDisabled, r);
  step('arrows also flank the board itself and mirror the strip\'s enabled state', r.sideArrows === 2 && r.sideNextDisabled && r.sidePrevEnabled, r);

  r = await page.evaluate(() => {
    const before = _boardCurrent('proj1').id;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    return { before, after: _boardCurrent('proj1').id };
  });
  step('← key slides to the previous board', r.before !== r.after, r);

  // 8. Delete is undoable.
  r = await page.evaluate(async () => {
    boardOpen('proj1', '_bX');
    const id = boardCards.find(c => c.text === 'First thought').id;
    boardCardDelete(id);
    const gone = !boardCards.some(c => c.id === id) && !document.querySelector(`.bcard[data-card-id="${id}"]`);
    const toast = document.getElementById('undoToast').style.display === 'flex';
    _undoDelete();
    const back = boardCards.some(c => c.id === id) && !!document.querySelector(`.bcard[data-card-id="${id}"]`);
    return { gone, toast, back, stored: JSON.parse(localStorage.getItem('wt_board_cards')).some(c => c.id === id) };
  });
  step('delete removes the sticky with an undo toast; undo restores it', r.gone && r.toast && r.back && r.stored, r);

  // 9. ☰ List still renders the ledger; the pref is device-local and survives reload.
  r = await page.evaluate(() => {
    _setProjView('list');
    const c = document.getElementById('projCodeContent');
    return { listShown: c.style.display !== 'none', boardsHidden: document.getElementById('projBoardsWrap').style.display === 'none',
      hasTask: c.textContent.includes('RealTask'), toggle: !!c.querySelector('.board-seg'),
      pref: localStorage.getItem('wt_proj_view') };
  });
  step('☰ List shows the ledger with the view toggle; pref stored', r.listShown && r.boardsHidden && r.hasTask && r.toggle && r.pref === '"list"', r);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof _projView !== 'undefined' && document.querySelector('.tab.active') && document.getElementById('projCodeContent'), null, { timeout: 15000 });
  await page.waitForTimeout(600);
  // (the harness re-seeds localStorage on every navigation, so only the
  // un-seeded wt_proj_view key can prove persistence here)
  r = await page.evaluate(() => ({ view: _projView, listShown: document.getElementById('projCodeContent').style.display !== 'none', stored: localStorage.getItem('wt_proj_view'), lastUser: localStorage.getItem('wt_last_user'), snapshot: !!localStorage.getItem('wt_local_snapshot'), tab: document.querySelector('.tab.active')?.dataset.tab }));
  step('view pref survives reload', r.view === 'list' && r.listShown, r);

  await done(browser);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
