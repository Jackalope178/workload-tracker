// Boards Phase 2 (Sep 2026): the Projects tab lands on ⌂ Dash — one tile per
// active program, worst first — and each board carries a command-panel tile.
// Both read _projSignals: burn vs plan for the month (allocation vs logged +
// planned, the Reconcile view's numbers), MY next deadline or the attention
// reason (overdue > over budget > blocked > to delegate > waiting > inbox),
// and baton holders. Deadlines count only my work (invariant #11); nothing
// here writes. Panel mode (tiles/chips) is device-local.
const { launch, step, done } = require('./_lib');

const d = new Date();
const ym = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const t0 = ym + '-' + String(d.getDate()).padStart(2, '0');

(async () => {
  const { browser, page } = await launch({
    wt_active_tab: 'projects',
    wt_persons: ['Jordan K', 'Dana P'],
    wt_projects_meta: {
      hot:   { label: 'Hot Program', color: '#c33', billingCode: 'T-26-020', subCodes: [{ id: 'sc1', code: '1', label: 'Design' }, { id: 'sc2', code: '2', label: 'Build' }] },
      quiet: { label: 'Quiet Program', color: '#3a7', billingCode: 'T-26-021', subCodes: [{ id: 'sc9', code: '1', label: 'Only' }] },
      amber: { label: 'Amber Program', color: '#da3', billingCode: 'T-26-022', subCodes: [] }
    },
    wt_project_order: ['quiet', 'amber', 'hot'],
    wt_allocations: { ['hot|sc1|' + ym]: 10 },
    wt_completed: [{ id: '_c1', name: 'Logged', project: 'hot', subCode: 'sc1', dateCompleted: ym + '-01', estHours: 4, actualHours: 4 }],
    wt_tasks: [
      { id: '_t1', name: 'Planned today', project: 'hot', subCode: 'sc1', priority: 'med', due: t0, est: 3, completed: false, timer: 0, timerStart: null },
      { id: '_t2', name: 'Inbox thing', project: 'hot', subCode: 'sc1', priority: 'med', due: '', est: 0, completed: false, inbox: true, timer: 0, timerStart: null },
      { id: '_t3', name: 'Late one', project: 'hot', subCode: 'sc2', priority: 'high', due: '2020-01-01', est: 1, completed: false, timer: 0, timerStart: null },
      { id: '_t4', name: 'Theirs not mine', project: 'hot', subCode: 'sc2', priority: 'med', due: '2019-01-01', est: 1, completed: false, timer: 0, timerStart: null, delegatedTo: ['Dana P'] },
      { id: '_t5', name: 'Amber inbox', project: 'amber', subCode: '', priority: 'med', due: '', est: 0, completed: false, inbox: true, timer: 0, timerStart: null }
    ],
    wt_team: [
      { id: '_d1', name: 'Blocked deliverable', owner: 'Jordan K', owners: ['Jordan K'], project: 'hot', subCode: 'sc2', due: '2027-01-10', status: 'blocked', est: 3, activeOwner: 'Jordan K' }
    ]
  });

  // 1. Signals per sub-code.
  let r = await page.evaluate(ym => {
    const a = _projSignals('hot', 'sc1', ym), b = _projSignals('hot', 'sc2', ym), p = _projSignals('hot', null, ym), q = _projSignals('quiet', null, ym), m = _projSignals('amber', null, ym);
    const pick = s => ({ alloc: s.alloc, logged: s.logged, planned: s.planned, open: s.open, overdue: s.overdue, inbox: s.inbox, blocked: s.blocked, batons: s.batons, next: s.nextDue && s.nextDue.date, nextName: s.nextDue && s.nextDue.name, att: s.attention });
    return { a: pick(a), b: pick(b), p: pick(p), q: pick(q), m: pick(m) };
  }, ym);
  step('sc1 burn = 4h logged + 3h planned of 10h; next deadline = the dated task; inbox flagged amber', r.a.alloc === 10 && r.a.logged === 4 && r.a.planned === 3 && r.a.next === t0 && r.a.nextName === 'Planned today' && r.a.inbox === 1 && r.a.att.cls === 'amber' && r.a.att.label.includes('triage'), r.a);
  step('sc2: the overdue task wins attention (red), the delegated-away task is NOT my deadline, baton = Jordan', r.b.overdue === 1 && r.b.open === 1 && r.b.att.cls === 'red' && r.b.att.label.includes('1 overdue') && r.b.blocked === 1 && r.b.batons.join() === 'Jordan K', r.b);
  step('project-level rolls up: 10h alloc, 4h logged, 3h planned, 1 overdue, red', r.p.alloc === 10 && r.p.logged === 4 && r.p.planned === 3 && r.p.overdue === 1 && r.p.att.cls === 'red', r.p);
  step('a program with nothing open reads quiet; one with only an inbox item reads amber', r.q.att.cls === 'none' && r.m.att.cls === 'amber', { q: r.q.att, m: r.m.att });

  // 2. Dash is the landing view and sorts worst-first regardless of project order.
  r = await page.evaluate(() => {
    _switchTab(document.querySelector('.tab[data-tab="projects"]'));
    const tiles = [...document.querySelectorAll('.dash-grid .sig-tile')];
    const quietChips = [...document.querySelectorAll('.dash-quiet-chip')].map(c => c.textContent.trim());
    return { view: _projView, quietChips, order: tiles.map(t => t.querySelector('.sig-tile-title').textContent), cls: tiles.map(t => [...t.classList].find(c => c.startsWith('att-'))),
      burnTxt: tiles[0].querySelector('.sig-burn-txt').textContent, att: tiles[0].querySelector('.sig-att').textContent,
      baton: tiles[0].querySelector('.sig-batons') && tiles[0].querySelector('.sig-batons').textContent,
      summary: document.querySelector('.dash-summary').textContent, synced: SYNC_KEYS.includes('wt_proj_view') || SYNC_KEYS.includes('wt_board_panel') };
  });
  // (the app seeds its default project set, so more tiles than the three seeded here exist — order is what matters)
  step('⌂ Dash lands first, worst-first: Hot (red), Amber (amber); quiet programs compress to chips, never hidden', r.view === 'dash' && r.order.join('|') === 'Hot Program|Amber Program' && r.cls.join() === 'att-red,att-amber' && r.quietChips.includes('Quiet Program'), { order: r.order, cls: r.cls, quiet: r.quietChips.length });
  step('the Hot tile says burn, attention and baton', r.burnTxt.startsWith('4.0h of 10.0h') && r.burnTxt.includes('3.0h planned') && r.att.includes('1 overdue') && (r.baton || '').includes('Jordan K'), r);
  step('summary counts programs needing attention; view/panel prefs are device-local', /\d+ programs/.test(r.summary) && r.summary.includes('2 need') && !r.synced, r.summary);

  // 3. Clicking a tile drills into that program's boards; sub-code tiles carry the same signals.
  r = await page.evaluate(() => {
    document.querySelector('.dash-grid .sig-tile').click();
    const tiles = [...document.querySelectorAll('.board-strip .sig-tile')];
    const sc2 = tiles.find(t => t.querySelector('.sig-tile-title').textContent.includes('Build'));
    return { view: _projView, sel: selectedProjCode, boardShown: !!document.getElementById('boardStage'), nTiles: tiles.length,
      sc2Att: sc2 && sc2.querySelector('.sig-att').textContent, sc2Cls: sc2 && [...sc2.classList].find(c => c.startsWith('att-')),
      looseNoBurn: !tiles[0].querySelector('.sig-burn') };
  });
  step('tile click → that program\'s Boards; command panel has Loose + 2 sub-code tiles', r.view === 'boards' && r.sel === 'hot' && r.boardShown && r.nTiles === 3, r);
  step('the Build tile carries its own red "1 overdue"; Loose thoughts shows no burn bar', r.sc2Att.includes('1 overdue') && r.sc2Cls === 'att-red' && r.looseNoBurn, r);

  r = await page.evaluate(() => {
    const tiles = [...document.querySelectorAll('.board-strip .sig-tile')];
    tiles.find(t => t.querySelector('.sig-tile-title').textContent.includes('Build')).click();
    const opened = _boardCurrent('hot');
    boardTogglePanel();
    const chips = document.querySelectorAll('.board-strip .board-tab').length;
    const pref = localStorage.getItem('wt_board_panel');
    boardTogglePanel();
    return { openedSc: opened.scId, chips, pref, tilesBack: document.querySelectorAll('.board-strip .sig-tile').length };
  });
  step('clicking a sub-code tile opens that board; ▴ collapses tiles to chips (device-local) and back', r.openedSc === 'sc2' && r.chips === 3 && r.pref === '"chips"' && r.tilesBack === 3, r);

  // 4. Signals never write.
  r = await page.evaluate(() => {
    const before = JSON.stringify([localStorage.getItem('wt_tasks'), localStorage.getItem('wt_team'), localStorage.getItem('wt_allocations'), localStorage.getItem('wt_completed')]);
    _projSignals('hot', null); _projSignals('hot', 'sc1'); renderProjDash();
    const after = JSON.stringify([localStorage.getItem('wt_tasks'), localStorage.getItem('wt_team'), localStorage.getItem('wt_allocations'), localStorage.getItem('wt_completed')]);
    return before === after;
  });
  step('signals and the dash are read-only', r);

  await done(browser);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
