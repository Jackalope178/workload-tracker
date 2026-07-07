// Security invariant #1: user data is stored raw and escaped at render.
// Seed hostile strings into every major store and assert none of them
// executes or injects an element on any tab.
const { launch, step, done } = require('./_lib');

const XSS = '<img src=x onerror="window.__xss=1">';
const NAME = `Evil ${XSS} & "quotes" 'apostrophes'`;

(async () => {
  const { browser, page } = await launch({
    wt_persons: [`Jord"an' K ${XSS}`],
    wt_projects_meta: {
      evil_proj: { label: `Lab${XSS}el`, color: '#4a7', billingCode: `B"C${XSS}`, subCodes: [{ id: 'sc1', code: `c"1`, label: `Sub${XSS}` }], tags: [`tag${XSS}`] }
    },
    wt_tasks: [
      { id: '_t1', name: NAME, project: 'evil_proj', subCode: 'sc1', priority: 'med', due: '2026-07-10',
        est: 1, waiting: `wait${XSS}`, notes: `note${XSS}`, completed: false, timer: 0, timerStart: null,
        delegatedTo: [`Jord"an' K ${XSS}`] }
    ],
    wt_team: [
      { id: '_d1', name: NAME, owner: `Jord"an' K ${XSS}`, owners: [`Jord"an' K ${XSS}`], project: 'evil_proj',
        subCode: 'sc1', due: '2026-07-12', status: 'in-progress', priority: 'med', est: 1, waiting: `wait${XSS}`, notes: '' }
    ],
    wt_bigprojs: [{ id: '_bp', name: `BP${XSS}`, project: 'evil_proj', sessions: [
      { id: '_s1', num: 1, desc: NAME, date: '2026-07-14', hours: 1, done: false, subCode: 'sc1', priority: 'med',
        delegatedTo: [`Jord"an' K ${XSS}`], waiting: `w${XSS}`, recurrence: null, subtasks: [] }
    ] }],
    wt_completed: [
      { id: '_c1', name: NAME, project: 'evil_proj', subCode: 'sc1', dateCompleted: '2026-07-06', estHours: 1, actualHours: 1, category: '' }
    ]
  });

  const tabs = ['tasks', 'projects', 'team', 'timesheet', 'capacity', 'allocations'];
  for (const t of tabs) {
    const r = await page.evaluate(tab => {
      _switchTab(document.querySelector(`.tab[data-tab="${tab}"]`));
      if (tab === 'projects' && typeof selectProjCode === 'function') selectProjCode('evil_proj');
      return { fired: !!window.__xss, injected: document.querySelectorAll('img[src="x"]').length };
    }, t);
    step(`tab "${t}": hostile strings render inert (no onerror fired, no injected element)`,
      !r.fired && r.injected === 0, r);
  }

  // Board view with the hostile person's board — hits card owner pills + handlers
  const rb = await page.evaluate(() => {
    _switchTab(document.querySelector('.tab[data-tab="team"]'));
    setTeamView('board');
    return { fired: !!window.__xss, injected: document.querySelectorAll('img[src="x"]').length };
  });
  step('team board view renders hostile owners inert', !rb.fired && rb.injected === 0, rb);

  await done(browser);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
