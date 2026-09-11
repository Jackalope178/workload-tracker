// The docket (Sep 2026): a sub-code board is an idea board AND the read-out
// of what is queued on that code. Every open task / work item / subtask that
// is mine appears as a VIRTUAL live card (dashed) on the docket strip; drag
// one onto the canvas and it becomes a stored, positioned card; remove it
// and it returns to the strip. In ⊞ Sort 2×2, linked cards sit in the box
// their PRIORITY maps to and dropping one in a box CHANGES the priority
// (urgent/high/med/low ↔ Do now/Schedule/Delegate/Park); the tray is 💭
// Ideas for unsorted stickies. Meetings, completed and delegated-away items
// never enter. ↗ Assign and ◖ Baton are reachable from cards, ☰ List rows
// and ▬ Timeline rows.
const { launch, step, done } = require('./_lib');

(async () => {
  const { browser, page } = await launch({
    wt_active_tab: 'projects',
    wt_proj_view: '"boards"',
    wt_persons: ['Jordan K'],
    wt_projects_meta: { pa: { label: 'Prog A', color: '#4a7', billingCode: 'T-1', subCodes: [{ id: 'sc1', code: '1', label: 'Design' }] } },
    wt_boards: [{ id: '_b1', projKey: 'pa', scId: 'sc1', createdAt: '2026-09-01' }],
    wt_board_cards: [
      { id: '_n1', boardId: '_b1', kind: 'note', x: 16, y: 16, w: 200, h: 140, color: 'yellow', z: 1, text: 'An idea', urgent: null, important: null },
      { id: '_r1', boardId: '_b1', kind: 'ref', x: 300, y: 16, w: 200, h: 120, color: 'white', z: 2, ref: { type: 'task', id: '_t3', label: 'x' } }
    ],
    wt_tasks: [
      { id: '_t1', name: 'Urgent one', project: 'pa', subCode: 'sc1', priority: 'urgent', due: '2026-10-02', est: 2, completed: false, timer: 0, timerStart: null },
      { id: '_t2', name: 'Low one', project: 'pa', subCode: 'sc1', priority: 'low', due: '2026-10-20', est: 1, completed: false, timer: 0, timerStart: null },
      { id: '_t3', name: 'Already placed', project: 'pa', subCode: 'sc1', priority: 'high', due: '2026-10-05', est: 1, completed: false, timer: 0, timerStart: null },
      { id: '_t4', name: 'A meeting', project: 'pa', subCode: 'sc1', priority: 'meeting', due: '2026-10-01', est: 1, completed: false, timer: 0, timerStart: null },
      { id: '_t5', name: 'Done one', project: 'pa', subCode: 'sc1', priority: 'med', due: '2026-09-01', est: 1, completed: true, timer: 0, timerStart: null },
      { id: '_t6', name: 'Theirs', project: 'pa', subCode: 'sc1', priority: 'med', due: '2026-10-03', est: 1, completed: false, timer: 0, timerStart: null, delegatedTo: ['Jordan K'] },
      { id: '_t7', name: 'Other code', project: 'pa', subCode: '', priority: 'med', due: '2026-10-03', est: 1, completed: false, timer: 0, timerStart: null }
    ],
    wt_bigprojs: [{ id: '_bp', name: 'Big', project: 'pa', sessions: [{ id: '_s1', num: 1, desc: 'Work item', date: '2026-10-10', hours: 3, done: false, subCode: 'sc1', priority: 'med', subtasks: [{ id: '_st1', desc: 'Sub bit', date: '2026-10-08', hours: 1, done: false, priority: 'high' }] }] }],
    wt_team: [{ id: '_d1', name: 'Deliverable', owner: 'Jordan K', owners: ['Jordan K'], project: 'pa', subCode: 'sc1', due: '2026-10-15', status: 'in-progress', est: 3, relay: [{ kind: 'work', who: 'Jordan K', est: 2, due: '2026-10-10' }, { kind: 'review', who: 'Me', est: 1, due: '2026-10-15' }], relayStage: 0, activeOwner: 'Jordan K' }]
  });

  // 1. Docket contents and order.
  let r = await page.evaluate(() => {
    _switchTab(document.querySelector('.tab[data-tab="projects"]'));
    selectProjCode('pa'); boardOpen('pa', '_b1');
    const strip = [...document.querySelectorAll('.board-docket .bcard')].map(e => ({ name: e.querySelector('.bc-ref-name').textContent.trim(), virtual: e.classList.contains('bc-virtual'), id: e.dataset.cardId }));
    const canvasRefs = [...document.querySelectorAll('#boardCanvas .bcard.bc-ref')].map(e => e.querySelector('.bc-ref-name').textContent.trim());
    return { strip, canvasRefs, stored: boardCards.length };
  });
  step('docket = my open tasks, work items and subtasks on this code, by date; dashed virtual cards, nothing stored', r.strip.map(x => x.name).join('|') === 'Urgent one|Sub bit|Work item|Low one' && r.strip.every(x => x.virtual && x.id.startsWith('v:')) && r.stored === 2, r.strip);
  step('meetings, completed, delegated-away and other-code items never enter; an already-placed task is not doubled', !r.strip.some(x => /meeting|Done one|Theirs|Other code|Already placed/.test(x.name)) && r.canvasRefs.includes('Already placed'), r);

  // 2. Drop onto the canvas materialises a stored card; back-to-docket returns it.
  r = await page.evaluate(() => {
    const before = boardCards.length;
    const c = _boardMaterialize('v:task:_t1', 123, 77);
    const stored = JSON.parse(localStorage.getItem('wt_board_cards')).find(k => k.id === c.id);
    const stripHas = [...document.querySelectorAll('.board-docket .bcard')].some(e => e.dataset.cardId === 'v:task:_t1');
    const onCanvas = !!document.querySelector(`#boardCanvas .bcard[data-card-id="${c.id}"]`);
    const isDocket = _boardIsDocketItem(c);
    boardCards = boardCards.filter(k => k.id !== c.id); _boardSave('wt_board_cards'); _boardRefreshBody();
    const back = [...document.querySelectorAll('.board-docket .bcard')].some(e => e.dataset.cardId === 'v:task:_t1');
    return { added: boardCards.length === before, stored: stored && [stored.x, stored.y, stored.ref.id], stripHas, onCanvas, isDocket, back };
  });
  step('dropping a docket card on the canvas stores a positioned linked card (snapped) and it leaves the strip', r.stored && r.stored[0] === 120 && r.stored[1] === 80 && r.stored[2] === '_t1' && !r.stripHas && r.onCanvas && r.isDocket, r);
  step('removing that card returns the item to the docket strip', r.added && r.back, r);

  // 3. 2×2: linked cards by priority; dropping changes priority; tray is Ideas.
  r = await page.evaluate(() => {
    boardSetView('_b1', 'grid');
    const inQ = q => [...document.querySelectorAll(`[data-quad="${q}"] .bcard`)].map(e => (e.querySelector('.bc-ref-name') || e.querySelector('.bc-text')).textContent.trim());
    const layout = { do: inQ('do'), schedule: inQ('schedule'), delegate: inQ('delegate'), park: inQ('park'), tray: inQ('tray') };
    const trayLabel = document.querySelector('.board-tray .board-quad-head strong').textContent;
    _boardSetQuadrant('v:task:_t2', 'do');
    const t2 = tasks.find(t => t.id === '_t2');
    const stored = JSON.parse(localStorage.getItem('wt_tasks')).find(t => t.id === '_t2').priority;
    const after = inQ('do');
    _boardSetQuadrant('_r1', 'park');
    const t3 = tasks.find(t => t.id === '_t3').priority;
    _boardSetQuadrant('v:session:_s1', 'schedule');
    const s1 = bigProjs[0].sessions[0].priority;
    const before = tasks.find(t => t.id === '_t1').priority;
    _boardSetQuadrant('v:task:_t1', 'tray');
    const unchanged = tasks.find(t => t.id === '_t1').priority === before;
    return { layout, trayLabel, t2: t2.priority, stored, after, t3, s1, unchanged };
  });
  step('linked cards sit by priority: urgent→Do now, high→Up next, med→Delegate, low→Park; the sticky waits in 💭 Ideas', r.layout.do.includes('Urgent one') && r.layout.schedule.includes('Already placed') && r.layout.schedule.includes('Sub bit') && r.layout.delegate.includes('Work item') && r.layout.park.includes('Low one') && r.layout.tray.includes('An idea') && r.trayLabel.includes('Ideas'), r.layout);
  step('dropping a docket card into Do now sets the task to urgent (saved) and it moves box', r.t2 === 'urgent' && r.stored === 'urgent' && r.after.includes('Low one'), r);
  step('stored linked cards and work items follow the same rule; dropping a task in Ideas never changes it', r.t3 === 'low' && r.s1 === 'high' && r.unchanged, r);

  // 4. ↗ / ◖ from cards, list rows and the timeline; the baton menu offers Pass → for my relay leg.
  r = await page.evaluate(() => {
    boardSetView('_b1', 'free');
    const taskCard = document.querySelector('.board-docket .bcard[data-card-id="v:task:_t1"]');
    const assignOnCard = !!(taskCard && taskCard.querySelector('.bc-act .row-edit-btn'));
    _setProjView('list');
    const listBaton = !!document.querySelector('#projCodeContent .session-row-actions button[onclick*="showBatonMenu"]');
    _setProjView('timeline');
    const tlBaton = !!document.querySelector('.tl-row[data-key="team:_d1"] button[onclick*="showBatonMenu"]');
    const tlAssign = !!document.querySelector('.tl-row[data-key="task:_t1"] button[onclick*="showTaskAssignDropdown"]');
    const tlAssignSub = !!document.querySelector('.tl-row[data-key="subtask:_st1"] button[onclick*="showAssignDropdown"]');
    // my leg: advance the relay to Me and open the menu
    const d = teamItems.find(x => x.id === '_d1'); d.relayStage = 1; d.activeOwner = 'Me'; save('wt_team', teamItems);
    showBatonMenu({ currentTarget: document.body, stopPropagation() {} }, '_d1');
    const menu = [...document.querySelectorAll('#dropdownMenu .dropdown-item')].map(e => e.textContent.trim());
    closeDropdown();
    return { assignOnCard, listBaton, tlBaton, tlAssign, tlAssignSub, menu };
  });
  step('↗ Assign sits on task cards and timeline rows; ◖ Baton on ☰ List and timeline deliverable rows', r.assignOnCard && r.listBaton && r.tlBaton && r.tlAssign && r.tlAssignSub, r);
  step('the baton menu on my relay leg offers ✓ Finish (last leg) / ↩ Send back / open', r.menu.some(m => m.includes('Finish')) && r.menu.some(m => m.includes('Send back')) && r.menu.some(m => m.includes('Open deliverable')), r.menu);

  // 5. Review fixes: baton menu from a card's ⋯ menu survives the dropdown close; no 'unsort' on linked cards; meetings never demoted by drag.
  r = await page.evaluate(async () => {
    _setProjView('boards'); boardOpen('pa', '_b1');
    boardPinItem('team', '_d1');
    const card = boardCards.find(c => c.boardId === '_b1' && c.kind === 'ref' && c.ref.id === '_d1');
    const btn = document.querySelector(`.bcard[data-card-id="${card.id}"] .bc-menu`);
    boardCardMenu({ currentTarget: btn, target: btn }, card.id);
    const menu1 = [...document.querySelectorAll('#dropdownMenu .dropdown-item')].map(e => e.textContent.trim());
    const unsortOnRef = menu1.some(m => m.includes('Clear urgent'));
    const batonIdx = menu1.findIndex(m => m.includes('Baton'));
    _ddSelect(batonIdx);
    await new Promise(r => setTimeout(r, 30));
    const open = document.getElementById('dropdownMenu').classList.contains('open');
    const menu2 = [...document.querySelectorAll('#dropdownMenu .dropdown-item')].map(e => e.textContent.trim());
    closeDropdown();
    boardPinItem('task', '_t4');
    const mcard = boardCards.find(c => c.boardId === '_b1' && c.kind === 'ref' && c.ref.id === '_t4');
    _boardSetQuadrant(mcard.id, 'do');
    const stillMeeting = tasks.find(x => x.id === '_t4').priority === 'meeting';
    return { unsortOnRef, open, menu2, stillMeeting };
  });
  step('◖ Baton from a card\'s ⋯ menu opens the baton menu (survives the dropdown close)', r.open && r.menu2.some(m => m.includes('Finish') || m.includes('Pass')), r);
  step('linked cards offer no "Clear urgent / important"; a pinned meeting is never demoted by dropping it in a box', !r.unsortOnRef && r.stillMeeting, r);

  await done(browser);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
