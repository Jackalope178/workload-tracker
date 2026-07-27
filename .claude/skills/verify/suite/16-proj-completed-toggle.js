// Projects tab ✓ Completed toggle: hides done rows (sessions, subtasks, team
// items) while sub-code header counts still count everything; a section whose
// items are ALL done says so instead of looking empty; the preference is
// device-local (wt_proj_show_completed, never in SYNC_KEYS) and persists
// across reloads.
const { launch, step, done } = require('./_lib');

(async () => {
  const { browser, page } = await launch({
    wt_projects_meta: {
      proj1: { label: 'Toggle Proj', color: '#4a7', billingCode: 'T-26-001', subCodes: [
        { id: 'sc1', code: '1', label: 'Mixed' },
        { id: 'sc2', code: '2', label: 'AllDone' }
      ] }
    },
    wt_tasks: [
      { id: '_t1', name: 'OpenTask', project: 'proj1', subCode: 'sc1', priority: 'med', due: '2026-08-03', est: 1, completed: false, timer: 0, timerStart: null }
    ],
    wt_bigprojs: [{ id: '_bp', name: 'BigProj', project: 'proj1', sessions: [
      { id: '_s1', num: 1, desc: 'OpenSess', date: '2026-08-04', hours: 2, done: false, subCode: 'sc1', priority: 'med', subtasks: [] },
      { id: '_s2', num: 2, desc: 'DoneSess', date: '2026-07-01', hours: 1, done: true, subCode: 'sc1', priority: 'med', subtasks: [] },
      { id: '_s3', num: 3, desc: 'DoneSessSc2', date: '2026-07-02', hours: 1, done: true, subCode: 'sc2', priority: 'med', subtasks: [] }
    ] }],
    wt_team: [
      { id: '_d1', name: 'DoneDeliv', owner: 'Jordan K', owners: ['Jordan K'], project: 'proj1', subCode: 'sc1', due: '2026-07-05', status: 'complete', est: 1 }
    ]
  });

  const readProj = () => page.evaluate(() => {
    _switchTab(document.querySelector('.tab[data-tab="projects"]'));
    selectProjCode('proj1');
    const c = document.getElementById('projCodeContent');
    return {
      text: c.textContent,
      counts: [...c.querySelectorAll('.subcode-count')].map(e => e.textContent.trim()),
      pref: localStorage.getItem('wt_proj_show_completed'),
      synced: SYNC_KEYS.includes('wt_proj_show_completed')
    };
  });

  let r = await readProj();
  step('default: completed rows are visible',
    r.text.includes('DoneSess') && r.text.includes('DoneDeliv') && r.text.includes('DoneSessSc2'), r.counts);
  step('sc1 header counts everything (2 open / 4 total)', r.counts.includes('2 open / 4 total'), r.counts);

  await page.evaluate(() => _toggleProjShowCompleted());
  r = await readProj();
  step('toggled off: done session/deliverable rows are hidden',
    !r.text.includes('DoneSess') && !r.text.includes('DoneDeliv'), undefined);
  step('open rows survive the toggle', r.text.includes('OpenTask') && r.text.includes('OpenSess'), undefined);
  step('header counts unchanged while rows are hidden', r.counts.includes('2 open / 4 total'), r.counts);
  step('all-done section explains itself instead of looking empty',
    r.text.includes('completed — hidden by the ✓ Completed toggle'), undefined);
  step('preference stored device-local, never synced', r.pref === 'false' && !r.synced,
    { pref: r.pref, synced: r.synced });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  r = await readProj();
  step('hidden state persists across reload', !r.text.includes('DoneSess') && r.counts.includes('2 open / 4 total'), r.counts);

  await page.evaluate(() => _toggleProjShowCompleted());
  r = await readProj();
  step('toggling back on restores completed rows', r.text.includes('DoneSess') && r.text.includes('DoneDeliv'), undefined);

  await done(browser);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
