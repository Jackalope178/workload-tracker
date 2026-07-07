// Team board invariants: merged In Review column; meeting cards are
// status-less in the Meetings column; the Waiting chip sees delegated
// composites; solo-card baton suppression; sort toggle modes.
const { launch, step, done } = require('./_lib');

(async () => {
  const { browser, page } = await launch({
    wt_active_tab: 'team',
    wt_team_view: '"board"',
    wt_team_board_person: '"Jordan K"',
    wt_persons: ['Jordan K', 'Audrey'],
    wt_projects_meta: {
      alpha: { label: 'Alpha', color: '#47a', billingCode: 'A-1', subCodes: [], tags: [] },
      zeta: { label: 'Zeta', color: '#a47', billingCode: 'Z-1', subCodes: [], tags: [] }
    },
    wt_team: [
      { id: '_r1', name: 'Ready one', owner: 'Jordan K', owners: ['Jordan K'], project: 'alpha', subCode: '', due: '2026-07-10', status: 'ready-review', priority: 'med', est: 1, waiting: '', notes: '' },
      { id: '_r2', name: 'In review one', owner: 'Jordan K', owners: ['Jordan K'], project: 'alpha', subCode: '', due: '2026-07-12', status: 'in-review', priority: 'med', est: 1, waiting: 'legal', notes: '' },
      { id: '_solo', name: 'Solo native', owner: 'Jordan K', owners: ['Jordan K'], project: 'zeta', subCode: '', due: '2026-07-09', status: 'in-progress', priority: 'med', est: 1, waiting: '', notes: '', activeOwner: 'Jordan K' }
    ],
    wt_tasks: [
      { id: '_m1', name: 'Designated meeting', project: 'alpha', subCode: '', priority: 'meeting', due: '2026-07-08', est: 0.5, completed: false, timer: 0, timerStart: null, delegatedTo: ['Jordan K'] },
      { id: '_t1', name: 'Delegated waiting task', project: 'zeta', subCode: '', priority: 'med', due: '2026-07-11', est: 1, waiting: 'IT ticket', completed: false, timer: 0, timerStart: null, delegatedTo: ['Jordan K'] }
    ]
  });

  const r = await page.evaluate(() => {
    const cols = [...document.querySelectorAll('.team-board-col')].map(c => ({
      head: c.querySelector('.team-board-col-head').textContent.trim(),
      cards: [...c.querySelectorAll('.team-board-card')].map(x => ({
        name: x.querySelector('.team-board-card-name').textContent.trim(),
        badge: x.querySelector('.status-badge')?.textContent.trim() ?? null,
        baton: x.querySelector('.team-baton')?.textContent.trim() ?? null,
        wait: x.querySelector('.team-board-card-wait')?.textContent.trim() ?? null
      }))
    }));
    const chips = [...document.querySelectorAll('.team-chips .team-chip')].map(c => c.textContent.trim());
    return { cols, chips };
  });

  const colOf = name => r.cols.find(c => c.cards.some(x => x.name.includes(name)));
  const card = name => r.cols.flatMap(c => c.cards).find(x => x.name.includes(name));

  step('ready-review and in-review share ONE merged In Review column',
    colOf('Ready one') === colOf('In review one') && /In Review/i.test(colOf('Ready one').head), colOf('Ready one')?.head);
  step('meeting card sits in the Meetings column with NO status badge',
    /Meetings/i.test(colOf('Designated meeting')?.head || '') && card('Designated meeting').badge === null,
    card('Designated meeting'));
  step('no Blocked chip; Waiting chip counts delegated composites too (2)',
    !r.chips.some(c => /Blocked/i.test(c)) && r.chips.some(c => /⏳ Waiting\s*2/.test(c)), r.chips);
  step('delegated task card shows its ⏳ note', /IT ticket/.test(card('Delegated waiting task').wait || ''), card('Delegated waiting task').wait);
  step("solo card on Jordan's own board shows no baton echo", card('Solo native').baton === null, card('Solo native'));

  // Sort toggle: due mode flattens with per-card project line; project mode groups
  const r2 = await page.evaluate(() => {
    _setTeamBoardSort('due');
    const hdrsDue = document.querySelectorAll('.team-board-projhdr').length;
    const inRev = [...document.querySelectorAll('.team-board-col')].find(c => c.textContent.includes('In Review'));
    const order = [...inRev.querySelectorAll('.team-board-card .team-board-card-name')].map(x => x.textContent.trim());
    _setTeamBoardSort('project');
    const hdrsProj = document.querySelectorAll('.team-board-projhdr').length;
    return { hdrsDue, order, hdrsProj };
  });
  step('due mode: no project headers, nearest due first', r2.hdrsDue === 0 && r2.order[0].includes('Ready one'), r2.order);
  step('project mode: headers return', r2.hdrsProj > 0, r2.hdrsProj);

  await done(browser);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
