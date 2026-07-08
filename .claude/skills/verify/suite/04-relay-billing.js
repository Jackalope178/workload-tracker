// Relay/KME invariants: a Me leg mirrors into wt_tasks (leg est, not
// deliverable est); passing bills EXACTLY ONCE to wt_completed at the
// deliverable's code, quarter-rounded with the 0.25 floor; teammate passes
// bill nothing; plannedItems never counts the wt_team item itself.
const { launch, step, done } = require('./_lib');

(async () => {
  const { browser, page } = await launch({
    wt_active_tab: 'team',
    wt_persons: ['Jordan K'],
    wt_projects_meta: { overhead: { label: 'Overhead', color: '#4a7', billingCode: 'T-0', subCodes: [{ id: 'sc1', code: '1', label: 'Prep' }], tags: [] } },
    wt_team: [{
      id: '_d1', name: 'Relay item', owner: 'Jordan K', owners: ['Jordan K', 'Me'], project: 'overhead',
      subCode: 'sc1', due: '2026-07-20', status: 'in-progress', priority: 'med', est: 5, waiting: '', notes: '',
      relay: [
        { id: 'r1', kind: 'work', who: 'Jordan K', est: 4, due: '2026-07-15', note: '' },
        { id: 'r2', kind: 'review', who: 'Me', est: 0.5, due: '2026-07-18', note: '' }
      ],
      relayStage: 0, relayStarted: true, activeOwner: 'Jordan K', relayLog: []
    }]
  });

  // 0. BEFORE any pass: my future review leg already holds its date in
  // Capacity (synthetic future-leg entry); Jordan's leg never counts as mine.
  let r = await page.evaluate(() => ({
    planned: plannedItems('2026-07-01', '2026-07-31').map(i => ({ name: i.name, h: i.hours, date: i.date, fut: !!i._relayFuture }))
  }));
  step('future Me leg holds in Capacity BEFORE the baton arrives (0.5h on its stage due)',
    r.planned.length === 1 && r.planned[0].h === 0.5 && r.planned[0].date === '2026-07-18' && r.planned[0].fut, r.planned);

  // 1. Teammate passes her leg — no billing entry, baton reaches Me, mirror appears
  r = await page.evaluate(() => {
    relayAdvance('_d1', 0);
    const item = teamItems.find(t => t.id === '_d1');
    const mirror = tasks.find(t => t._deliverableId === '_d1');
    return {
      completedCount: completed.length,
      stage: item.relayStage, holder: item.activeOwner,
      mirror: mirror && { est: mirror.est, project: mirror.project, subCode: mirror.subCode, delegatedTo: mirror.delegatedTo, completed: mirror.completed },
      logHours: item.relayLog.filter(e => e.action === 'pass').map(e => e.hours),
      planned: plannedItems('2026-07-01', '2026-07-31')
    };
  });
  step('teammate pass bills NOTHING to wt_completed', r.completedCount === 0, r.completedCount);
  step('teammate pass records stage est (4h) in relayLog for the allocation meters', JSON.stringify(r.logHours) === '[4]', r.logHours);
  step('baton reaches Me → mirror task with the LEG est (0.5), deliverable code, delegatedTo null',
    r.mirror && r.mirror.est === 0.5 && r.mirror.subCode === 'sc1' && r.mirror.delegatedTo === null && !r.mirror.completed, r.mirror);
  step('once the leg is CURRENT the mirror replaces the synthetic entry — still exactly one 0.5h, no double count',
    r.planned.filter(i => i.hours === 0.5).length === 1 && !r.planned.some(i => i._relayFuture) &&
    !r.planned.some(i => i.hours === 5 || i.hours === 4),
    r.planned.map(i => ({ name: i.name, h: i.hours, fut: !!i._relayFuture })));

  // 2. Me passes with 1.3h — bills once, quarter-rounded (1.3 → 1.25), mirror closes
  r = await page.evaluate(() => {
    relayAdvance('_d1', 1.3);
    const item = teamItems.find(t => t.id === '_d1');
    const mirror = tasks.find(t => t._deliverableId === '_d1');
    return {
      entries: completed.map(c => ({ hours: c.actualHours, subCode: c.subCode, project: c.project })),
      relayDone: item.relayStage >= item.relay.length,
      mirrorClosed: mirror && mirror.completed
    };
  });
  step('Me pass bills EXACTLY ONE entry, 1.3h quarter-rounded to 1.25, at the deliverable code',
    r.entries.length === 1 && r.entries[0].hours === 1.25 && r.entries[0].subCode === 'sc1', r.entries);
  step('relay completes and the mirror closes', r.relayDone && r.mirrorClosed);

  await done(browser);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
