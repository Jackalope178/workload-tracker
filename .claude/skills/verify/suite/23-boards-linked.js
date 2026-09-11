// Boards Phase 1 (Sep 2026): a sticky becomes work only by PROMOTION —
// ⋯ → Make this a task creates an Inbox task (no date/est → invisible to
// Capacity until triaged), the card turns into a LIVE linked card (nothing
// copied: due/status/who resolve on every render), and the task remembers
// its sticky (_boardCard). 📌 pins existing items as linked cards (no
// duplicates); a deleted item leaves a dashed "no longer exists" card that
// can be unlinked back to a sticky (never lose the thought); headings roll
// up the linked cards stacked beneath them; meeting cards are dated, only
// http(s) links render, and ✂ Task from selection pulls a task out while the
// note keeps its text. createdAt is stamped on user-created tasks.
const { launch, step, done } = require('./_lib');

(async () => {
  const { browser, page } = await launch({
    wt_active_tab: 'projects',
    wt_persons: ['Jordan K'],
    wt_projects_meta: {
      proj1: { label: 'Link Proj', color: '#4a7', billingCode: 'T-26-010', subCodes: [{ id: 'sc1', code: '1', label: 'Design' }] }
    },
    wt_boards: [{ id: '_b1', projKey: 'proj1', scId: 'sc1', createdAt: '2026-09-01' }],
    wt_board_cards: [
      { id: '_h1', boardId: '_b1', kind: 'heading', x: 16, y: 16, w: 460, h: 44, color: 'white', z: 1, text: 'County questions', urgent: null, important: null },
      { id: '_n1', boardId: '_b1', kind: 'note', x: 16, y: 80, w: 200, h: 140, color: 'yellow', z: 2, text: 'Ask Dana about the intake permit\nbefore the 9/24 meeting', urgent: true, important: true },
      { id: '_n2', boardId: '_b1', kind: 'note', x: 236, y: 80, w: 200, h: 140, color: 'pink', z: 3, text: 'Delegate-box thought', urgent: true, important: false },
      { id: '_n3', boardId: '_b1', kind: 'note', x: 700, y: 80, w: 200, h: 140, color: 'blue', z: 4, text: 'Outside the heading column', urgent: null, important: null },
      { id: '_m1', boardId: '_b1', kind: 'meeting', x: 16, y: 400, w: 300, h: 200, color: 'white', z: 5, text: 'Board meeting: Jordan to draft the one-pager by October. Also revisit the reuse credit model.', date: '2026-09-10', url: 'javascript:alert(1)', urgent: null, important: null }
    ],
    wt_tasks: [
      { id: '_t9', name: 'Existing task', project: 'proj1', subCode: 'sc1', priority: 'med', due: '2026-10-05', est: 2, completed: false, timer: 0, timerStart: null, delegatedTo: ['Jordan K'] }
    ],
    wt_team: [
      { id: '_d1', name: 'Deliverable X', owner: 'Jordan K', owners: ['Jordan K'], project: 'proj1', subCode: 'sc1', due: '2026-09-30', status: 'in-progress', est: 3, activeOwner: 'Jordan K' }
    ]
  });

  const open = () => page.evaluate(() => { _switchTab(document.querySelector('.tab[data-tab="projects"]')); selectProjCode('proj1'); boardOpen('proj1', '_b1'); });
  await open();

  // 1. Promote from the Do-now box → urgent Inbox task, live card, back-link, createdAt.
  let r = await page.evaluate(() => {
    const t = boardPromoteCard('_n1');
    const c = boardCards.find(k => k.id === '_n1');
    const el = document.querySelector('.bcard[data-card-id="_n1"]');
    return { name: t.name, notes: t.notes, project: t.project, subCode: t.subCode, priority: t.priority, inbox: t.inbox, due: t.due, est: t.est,
      createdAt: t.createdAt, back: t._boardCard, kind: c.kind, refId: c.ref && c.ref.id, refType: c.ref && c.ref.type,
      isRef: el && el.classList.contains('bc-ref'), shows: el && el.querySelector('.bc-ref-name').textContent,
      badge: el && el.querySelector('.bc-ref-badge').textContent,
      planned: plannedItems('2026-09-01', '2027-12-31').length,
      modalOpen: document.getElementById('editTaskModal').classList.contains('open') };
  });
  step('promotion creates an Inbox task on the board\'s code; first line = name, rest = notes', r.name === 'Ask Dana about the intake permit' && r.notes === 'before the 9/24 meeting' && r.project === 'proj1' && r.subCode === 'sc1' && r.inbox === true && r.due === '' && r.est === 0, r);
  step('Do-now quadrant seeds urgent priority; createdAt stamped; task remembers its sticky', r.priority === 'urgent' && r.createdAt === today_(), r);
  step('card becomes a live linked card showing the task', r.kind === 'ref' && r.refType === 'task' && r.isRef && r.shows === 'Ask Dana about the intake permit' && r.badge.includes('inbox'), r);
  // (the seeded dated task is delegated entirely to Jordan, so it leaves Capacity too — invariant 11)
  step('an Inbox task (no date) is still invisible to Capacity', r.planned === 0, r.planned);
  step('promotion from Do now does NOT open the modal', !r.modalOpen);

  // 2. Delegate box → opens the task modal with the Team section first.
  r = await page.evaluate(() => {
    const t = boardPromoteCard('_n2');
    const open = document.getElementById('editTaskModal').classList.contains('open');
    const teamOpen = document.getElementById('editSecTeam').classList.contains('open');
    document.getElementById('editTaskModal').classList.remove('open');
    return { pri: t.priority, open, teamOpen };
  });
  step('Delegate quadrant → med priority and the modal opens on the Team section', r.pri === 'med' && r.open && r.teamOpen, r);

  // 3. Live: setting a due date and completing the task shows on the card without any copy.
  r = await page.evaluate(() => {
    const c = boardCards.find(k => k.id === '_n1');
    const t = tasks.find(x => x.id === c.ref.id);
    t.due = '2020-01-01'; t.inbox = false; save('wt_tasks', tasks);
    renderProjBoards('proj1');
    const el = document.querySelector('.bcard[data-card-id="_n1"]');
    const overdue = el.querySelector('.bc-ref-due').classList.contains('overdue');
    t.completed = true; save('wt_tasks', tasks); renderProjBoards('proj1');
    const el2 = document.querySelector('.bcard[data-card-id="_n1"]');
    return { overdue, doneCls: el2.classList.contains('done'), badge: el2.querySelector('.bc-ref-badge').textContent, textField: c.text };
  });
  step('linked card resolves live: overdue due date, then done state — nothing copied onto the card', r.overdue && r.doneCls && r.badge.includes('done') && r.textField === '', r);

  // 4. Heading rollup counts only the column beneath it.
  r = await page.evaluate(() => {
    const c = boardCards.find(k => k.id === '_n1'); const t = tasks.find(x => x.id === c.ref.id); t.completed = false; t.due = '2026-11-02'; save('wt_tasks', tasks);
    const ru = _boardHeadingRollup(boardCards.find(k => k.id === '_h1'), boardCards.filter(k => k.boardId === '_b1'));
    renderProjBoards('proj1');
    const meta = document.querySelector('.bcard[data-card-id="_h1"] .bc-head-meta');
    return { members: ru.members, open: ru.open, nextDue: ru.nextDue, metaText: meta && meta.textContent };
  });
  // members = the two linked cards + the meeting card stacked below (a thought); the blue sticky off to the right is not in the column
  step('heading rolls up what is stacked under it (2 open linked + 1 thought), not the sticky off to the right', r.members === 3 && r.open === 2 && r.nextDue === '2026-11-02' && r.metaText.includes('2 open') && r.metaText.includes('next') && r.metaText.includes('1 thought'), r);

  // 5. Pin existing items; no duplicates; who/baton shows.
  r = await page.evaluate(() => {
    boardPinItem('task', '_t9'); boardPinItem('task', '_t9'); boardPinItem('team', '_d1');
    const refs = boardCards.filter(k => k.boardId === '_b1' && k.kind === 'ref');
    const taskCard = refs.find(k => k.ref.id === '_t9'); const teamCard = refs.find(k => k.ref.id === '_d1');
    const tEl = document.querySelector(`.bcard[data-card-id="${taskCard.id}"]`);
    const dEl = document.querySelector(`.bcard[data-card-id="${teamCard.id}"]`);
    return { taskPins: refs.filter(k => k.ref.id === '_t9').length, teamPinned: !!teamCard,
      taskWho: tEl.querySelector('.delegate-tag')?.textContent, teamWho: dEl.querySelector('.delegate-tag')?.textContent,
      teamBadge: dEl.querySelector('.bc-ref-badge').textContent, teamCls: dEl.classList.contains('bc-team') };
  });
  step('📌 pins a task and a deliverable once each (second pin is a no-op)', r.taskPins === 1 && r.teamPinned, r);
  step('pinned cards show who holds it and the deliverable status', (r.taskWho || '').includes('Jordan K') && (r.teamWho || '').includes('Jordan K') && r.teamBadge === 'In Progress' && r.teamCls, r);

  // 6. Deleted item → dashed card; unlink keeps the thought as a sticky.
  r = await page.evaluate(() => {
    tasks = tasks.filter(x => x.id !== '_t9'); save('wt_tasks', tasks); renderProjBoards('proj1');
    const card = boardCards.find(k => k.boardId === '_b1' && k.kind === 'ref' && k.ref.id === '_t9');
    const el = document.querySelector(`.bcard[data-card-id="${card.id}"]`);
    const missing = el.classList.contains('missing') && el.textContent.includes('no longer exists') && el.textContent.includes('Existing task');
    // unlink via the menu path
    card.kind = 'note'; card.text = _boardRefResolve(card.ref).name; card.ref = null; _boardSave('wt_board_cards'); renderProjBoards('proj1');
    const el2 = document.querySelector(`.bcard[data-card-id="${card.id}"]`);
    return { missing, sticky: !el2.classList.contains('bc-ref') && el2.querySelector('.bc-text').textContent === 'Existing task' };
  });
  step('a deleted task leaves a dashed "no longer exists" card; unlinking keeps its name as a sticky', r.missing && r.sticky, r);

  // 7. Meeting card: unsafe link never renders; date shows; ✂ selection → task, note intact.
  r = await page.evaluate(() => {
    const el = document.querySelector('.bcard[data-card-id="_m1"]');
    const noLink = !el.querySelector('a');
    const dateShown = el.textContent.includes('Sep 10');
    const t = _boardTaskFromSelection('_m1', 'Jordan to draft the one-pager by October');
    const m = boardCards.find(k => k.id === '_m1');
    const refCard = boardCards.find(k => k.boardId === '_b1' && k.kind === 'ref' && k.ref.id === t.id);
    return { noLink, dateShown, name: t.name, notes: t.notes, back: t._boardCard, inbox: t.inbox, textKept: m.text.includes('reuse credit model'), refCard: !!refCard };
  });
  step('javascript: link is not rendered; meeting date shows', r.noLink && r.dateShown, r);
  step('✂ Task from selection creates an Inbox task + linked card; the meeting note keeps its text', r.name === 'Jordan to draft the one-pager by October' && r.notes.startsWith('From meeting') && r.back === '_m1' && r.inbox && r.textKept && r.refCard, r);

  r = await page.evaluate(() => {
    const m = boardCards.find(k => k.id === '_m1'); m.url = 'https://loop.example/page'; _boardSave('wt_board_cards'); renderProjBoards('proj1');
    const a = document.querySelector('.bcard[data-card-id="_m1"] a');
    return { href: a && a.getAttribute('href'), rel: a && a.getAttribute('rel') };
  });
  step('an https link renders with rel=noopener', r.href === 'https://loop.example/page' && (r.rel || '').includes('noopener'), r);

  // 8. Origin chip on the task row jumps back to the sticky.
  r = await page.evaluate(() => {
    _switchTab(document.querySelector('.tab[data-tab="tasks"]'));
    const t = tasks.find(x => x._boardCard === '_m1');
    const row = document.querySelector(`.task-row[data-id="${t.id}"]`);
    const chip = row && row.querySelector('.board-origin-chip');
    if (chip) chip.click();
    return { chip: !!chip, tab: document.querySelector('.tab.active').dataset.tab, view: _projView, open: _boardCurrent('proj1').id,
      flashed: !!document.querySelector('.bcard[data-card-id="_m1"].flash') };
  });
  step('💭 chip on the My Tasks row reveals the source sticky on its board', r.chip && r.tab === 'projects' && r.view === 'boards' && r.open === '_b1' && r.flashed, r);

  // 9. createdAt on quick capture.
  r = await page.evaluate(() => {
    _switchTab(document.querySelector('.tab[data-tab="tasks"]'));
    document.getElementById('quickCapture').value = 'Captured thing'; quickCaptureAdd();
    return tasks.find(x => x.name === 'Captured thing').createdAt;
  });
  step('quick capture stamps createdAt', r === today_(), r);

  await done(browser);

  function today_() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
