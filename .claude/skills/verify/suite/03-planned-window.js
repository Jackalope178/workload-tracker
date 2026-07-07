// Math invariant #2: plannedItems(from, to) only returns items dated inside
// the window (overrides re-window occurrences; month holds carry the -15
// placeholder; delegated items are excluded — invariant "hours have one home").
const { launch, step, done } = require('./_lib');

(async () => {
  const { browser, page } = await launch({
    wt_persons: ['Jordan K'],
    wt_tasks: [
      { id: '_w', name: 'Weekly Monday', project: 'overhead', subCode: '', priority: 'med',
        due: '2026-07-06', est: 1, completed: false, timer: 0, timerStart: null,
        recurrence: { type: 'weekly', daysOfWeek: [1], skips: [], overrides: { '2026-08-10': '2026-09-02' } } },
      { id: '_h', name: 'Held for August', project: 'overhead', subCode: '', priority: 'med',
        due: '', est: 3, completed: false, timer: 0, timerStart: null, allocMonth: '2026-08' },
      { id: '_d', name: 'Delegated away', project: 'overhead', subCode: '', priority: 'med',
        due: '2026-08-05', est: 2, completed: false, timer: 0, timerStart: null, delegatedTo: ['Jordan K'] }
    ]
  });

  const r = await page.evaluate(() => {
    const aug = plannedItems('2026-08-01', '2026-08-31');
    const sep = plannedItems('2026-09-01', '2026-09-30');
    return {
      augDatesInWindow: aug.every(i => i.date >= '2026-08-01' && i.date <= '2026-08-31'),
      weeklyAug: aug.filter(i => i.name === 'Weekly Monday').map(i => i.date),
      hold: aug.find(i => i._allocHold && i.name.includes('Held for August')),
      delegatedInAug: aug.some(i => i.name === 'Delegated away'),
      movedIntoSep: sep.filter(i => i.name === 'Weekly Monday').map(i => i.date)
    };
  });

  step('every August item is dated inside the August window', r.augDatesInWindow);
  // Aug 2026 Mondays: 3, 10, 17, 24, 31 — the 10th is overridden out to Sep 2
  step('weekly expansion = Aug Mondays minus the overridden 10th',
    JSON.stringify(r.weeklyAug) === JSON.stringify(['2026-08-03', '2026-08-17', '2026-08-24', '2026-08-31']), r.weeklyAug);
  step('override moved INTO September is picked up there', r.movedIntoSep.includes('2026-09-02'), r.movedIntoSep);
  step('month hold appears with _allocHold and the -15 placeholder date',
    !!r.hold && r.hold.date === '2026-08-15' && r.hold.hours === 3, r.hold && { date: r.hold.date, hours: r.hold.hours });
  step('task delegated to someone else is NOT my planned load', !r.delegatedInAug);

  await done(browser);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
