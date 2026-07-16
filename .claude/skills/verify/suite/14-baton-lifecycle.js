// Baton ↔ mirror lifecycle: every path that completes or deletes a
// deliverable must close/remove its My Tasks mirror, the startup audit
// heals drift in both directions, and completing a NON-relay baton mirror
// records my part on the deliverable.
const { launch, step, done } = require('./_lib');

const task = (id, name, dId) => ({
  id, name, project: 'overhead', subCode: '', priority: 'med', due: '2027-02-20', est: 1,
  category: '', waiting: '', notes: '', timer: 0, timerStart: null, completed: false, _deliverableId: dId
});

(async () => {
  const { browser, page } = await launch({
    wt_persons: ['Jordan K'],
    wt_projects_meta: { overhead: { label: 'Overhead', color: '#4a7', billingCode: 'T-0', subCodes: [], tags: [] } },
    wt_team: [
      // _d1: in-flight relay, current stage is Me, but its mirror is MISSING (drift)
      {
        id: '_d1', name: 'NeedsMirror', owner: 'Me', owners: ['Me'], project: 'overhead', subCode: '',
        due: '2027-02-20', status: 'in-progress', priority: 'med', est: 2, waiting: '', notes: '',
        relay: [{ id: 'r1', kind: 'review', who: 'Me', est: 1.5, due: '2027-02-18', note: '' }],
        relayStage: 0, relayStarted: false, activeOwner: 'Me', relayLog: [], reviewTaskId: '_ghost'
      },
      // _d2: deliverable already complete, but an OPEN mirror survived (drift)
      {
        id: '_d2', name: 'DoneButMirrored', owner: 'Me', owners: ['Me'], project: 'overhead', subCode: '',
        due: '2027-02-21', status: 'complete', priority: 'med', est: 1, waiting: '', notes: '',
        relay: [{ id: 'r2', kind: 'review', who: 'Me', est: 1, due: '', note: '' }],
        relayStage: 0, relayStarted: false, activeOwner: 'Me', relayLog: [], reviewTaskId: '_m2'
      },
      // _d3: NON-relay baton handed to Me, sole owner
      {
        id: '_d3', name: 'PlainBaton', owner: 'Me', owners: ['Me'], project: 'overhead', subCode: '',
        due: '2027-02-22', status: 'in-progress', priority: 'med', est: 1, waiting: '', notes: '',
        activeOwner: 'Me', reviewTaskId: '_m3'
      },
      // _d4: in-flight relay with a live mirror — will be deleted
      {
        id: '_d4', name: 'DoomedRelay', owner: 'Me', owners: ['Me'], project: 'overhead', subCode: '',
        due: '2027-02-23', status: 'in-progress', priority: 'med', est: 1, waiting: '', notes: '',
        relay: [{ id: 'r4', kind: 'work', who: 'Me', est: 1, due: '', note: '' }],
        relayStage: 0, relayStarted: false, activeOwner: 'Me', relayLog: [], reviewTaskId: '_m4'
      }
    ],
    wt_tasks: [task('_m2', 'Review — DoneButMirrored', '_d2'), task('_m3', 'PlainBaton', '_d3'), task('_m4', 'Work — DoomedRelay', '_d4')]
  });

  // 1. Startup audit heals both directions.
  let r = await page.evaluate(() => {
    const m1 = tasks.find(t => t._deliverableId === '_d1' && !t.completed);
    const d1 = teamItems.find(t => t.id === '_d1');
    return {
      m1: m1 && { est: m1.est, linked: d1.reviewTaskId === m1.id },
      m2Closed: !!tasks.find(t => t.id === '_m2').completed,
      m3Open: !tasks.find(t => t.id === '_m3').completed,
      m4Open: !tasks.find(t => t.id === '_m4').completed
    };
  });
  step('audit re-creates the missing mirror for an in-flight Me leg (leg est, linked)', !!r.m1 && r.m1.est === 1.5 && r.m1.linked, r.m1);
  step('audit closes the orphan mirror of a completed deliverable', r.m2Closed, r.m2Closed);
  step('audit leaves legitimate mirrors alone (non-relay baton + live relay)', r.m3Open && r.m4Open, r);

  // 2. Deleting a deliverable removes its live mirror; undo restores both.
  r = await page.evaluate(() => {
    editingTeamId = '_d4';
    deleteTeamItem();
    const afterDel = { d: !!teamItems.find(t => t.id === '_d4'), m: !!tasks.find(t => t.id === '_m4') };
    _undoDelete();
    const afterUndo = { d: !!teamItems.find(t => t.id === '_d4'), m: !!tasks.find(t => t.id === '_m4') };
    return { afterDel, afterUndo };
  });
  step('deleting the deliverable removes its My Tasks mirror too', !r.afterDel.d && !r.afterDel.m, r.afterDel);
  step('undo restores both the deliverable and the mirror', r.afterUndo.d && r.afterUndo.m, r.afterUndo);

  // 3. Person-status roll-up to complete closes the mirror.
  r = await page.evaluate(() => {
    const ref = _teamObjFromKey('team:_d1');
    ref.applyOverall(true);
    const m1 = tasks.find(t => t._deliverableId === '_d1');
    return { status: teamItems.find(t => t.id === '_d1').status, mirrorClosed: !!m1.completed };
  });
  step('status roll-up to complete closes the Me-leg mirror', r.status === 'complete' && r.mirrorClosed, r);

  // 4. Completing a NON-relay baton mirror records my part on the deliverable.
  r = await page.evaluate(() => {
    openCompletionModal('_m3');
    confirmComplete(); // prefilled 1h
    const d = teamItems.find(t => t.id === '_d3');
    return {
      status: d.status, stampedMe: !!(d.ownerStatusAt && d.ownerStatusAt['Me']),
      billed: completed.some(c => c.name === 'PlainBaton' && c.actualHours === 1),
      mirrorGone: !tasks.some(t => t.id === '_m3')
    };
  });
  step('non-relay mirror completion: billed once, deliverable completes (sole owner), Me stamped',
    r.status === 'complete' && r.stampedMe && r.billed && r.mirrorGone, r);

  await done(browser);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
