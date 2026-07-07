// Math invariant #7: hand-off moves hours exactly once. Task hand-off deletes
// the source; subtask hand-off also drains the parent's total; done subtasks
// stay out of the est; open subtasks refuse; recurring items refuse.
const { launch, step, done } = require('./_lib');

(async () => {
  const { browser, page } = await launch({
    wt_persons: ['Jordan K'],
    wt_projects_meta: { overhead: { label: 'Overhead', color: '#4a7', billingCode: 'T-0', subCodes: [{ id: 'sc1', code: '1', label: 'Prep' }], tags: [] } },
    wt_tasks: [
      { id: '_t1', name: 'Hand me off', project: 'overhead', subCode: 'sc1', priority: 'high',
        due: '2026-07-15', est: 2, completed: false, timer: 0, timerStart: null },
      { id: '_t2', name: 'Recurring standup', project: 'overhead', subCode: '', priority: 'med',
        due: '2026-07-06', est: 0.5, completed: false, timer: 0, timerStart: null,
        recurrence: { type: 'weekly', daysOfWeek: [1], skips: [], overrides: {} } }
    ],
    wt_bigprojs: [{ id: '_bp', name: 'Big', project: 'overhead', sessions: [
      { id: '_s1', num: 1, desc: 'Parent session', date: '2026-07-22', hours: 6, done: false, subCode: 'sc1',
        priority: 'med', delegatedTo: null, waiting: '', recurrence: null, subtasks: [
          { id: '_st1', desc: 'Open subtask', date: '2026-07-21', hours: 2, done: false, subCode: 'sc1', priority: 'med' },
          { id: '_st2', desc: 'Done subtask', date: '2026-07-18', hours: 1, done: true, subCode: 'sc1', priority: 'med' }
        ] }
    ] }]
  });

  // 1. Task hand-off: source deleted, deliverable seeded Work(them)→Review(Me), Capacity drops it
  let r = await page.evaluate(() => {
    openEditModal('_t1');
    handoffTaskAsDeliverable('Jordan K');
    const item = teamItems.find(i => i.name === 'Hand me off');
    return {
      taskGone: !tasks.some(t => t.id === '_t1'),
      relay: item && item.relay.map(s => ({ kind: s.kind, who: s.who, est: s.est })),
      plannedJul: plannedItems('2026-07-01', '2026-07-31').filter(i => i.name.includes('Hand me off')).length
    };
  });
  step('task hand-off deletes the source', r.taskGone);
  step('relay pre-seeded Work(Jordan, 2h) → Review(Me)',
    r.relay && r.relay[0].who === 'Jordan K' && r.relay[0].est === 2 && r.relay[1].who === 'Me', r.relay);
  step('handed-off hours leave my Capacity (0 planned entries)', r.plannedJul === 0, r.plannedJul);
  await page.evaluate(() => { document.getElementById('editTeamModal').classList.remove('open'); });

  // 2. Recurring task refuses
  r = await page.evaluate(() => {
    _switchTab(document.querySelector('.tab[data-tab="tasks"]'));
    openEditModal('_t2');
    showTaskHandoffDropdown({ stopPropagation() {}, currentTarget: document.body });
    return {
      still: tasks.some(t => t.id === '_t2'),
      toast: document.getElementById('syncToastMsg')?.textContent || ''
    };
  });
  step('recurring task refuses hand-off with the Assign-to hint', r.still && /Recurring/i.test(r.toast), r.toast);
  await page.evaluate(() => closeEditModal());

  // 3. Session with open subtasks refuses
  r = await page.evaluate(() => {
    openEditSessionModal('_bp', '_s1');
    showSessionHandoffDropdown({ stopPropagation() {}, currentTarget: document.body });
    const still = bigProjs[0].sessions.some(s => s.id === '_s1');
    const toast = document.getElementById('syncToastMsg')?.textContent || '';
    closeEditSessionModal();
    return { still, toast };
  });
  step('session with open subtasks refuses', r.still && /open subtasks/i.test(r.toast), r.toast);

  // 4. Subtask hand-off: parent total drains by the subtask hours (6 → 4)
  r = await page.evaluate(() => {
    openEditSubtaskModal('_bp', '_s1', '_st1');
    handoffSessionAsDeliverable('Jordan K');
    const s = bigProjs[0].sessions.find(x => x.id === '_s1');
    const item = teamItems.find(i => i.name === 'Open subtask');
    // remaining own planned for the parent = 4 (new total) − 1 (done subtask) = 3
    const parentPlanned = plannedItems('2026-07-01', '2026-07-31')
      .filter(i => i.name.includes('Parent session')).reduce((a, i) => a + i.hours, 0);
    return { parentHours: s.hours, subGone: !(s.subtasks || []).some(x => x.id === '_st1'), est: item && item.est, parentPlanned };
  });
  step('subtask hand-off drains parent 6h → 4h (no double count)', r.subGone && r.parentHours === 4, r.parentHours);
  step('deliverable est = subtask hours (2h)', r.est === 2, r.est);
  step('parent planned remainder = 4 − 1 done = 3h', r.parentPlanned === 3, r.parentPlanned);
  await page.evaluate(() => { document.getElementById('editTeamModal').classList.remove('open'); });

  // 5. Session hand-off excludes DONE subtask hours from the est
  r = await page.evaluate(() => {
    _switchTab(document.querySelector('.tab[data-tab="projects"]'));
    openEditSessionModal('_bp', '_s1');   // now: total 4h, one done 1h subtask, no open ones
    handoffSessionAsDeliverable('Jordan K');
    const item = teamItems.find(i => i.name === 'Parent session');
    return { est: item && item.est, sessionGone: !bigProjs[0].sessions.some(s => s.id === '_s1') };
  });
  step('session est excludes done-subtask hours (4 − 1 = 3h)', r.sessionGone && r.est === 3, r.est);

  await done(browser);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
