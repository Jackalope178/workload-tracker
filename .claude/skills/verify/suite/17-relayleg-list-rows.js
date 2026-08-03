// Invariant #2 extension (Aug 2026): dated FUTURE Me legs of in-flight relays
// render in the My Tasks LIST as grey read-only ◖ rows naming who holds the
// baton, clickable through to the deliverable editor. Exactly-once: the
// current Me leg is its mirror task, future legs are relayleg rows — when the
// baton advances to a Me leg, the mirror takes over and the grey row retires.
const { launch, step, done } = require('./_lib');

(async () => {
  const { browser, page } = await launch({
    wt_persons: ['Jordan K'],
    wt_projects_meta: {
      proj1: { label: 'Relay Proj', color: '#4a7', billingCode: 'T-26-003', subCodes: [{ id: 'sc1', code: '1', label: 'Main' }] }
    },
    wt_team: [{
      id: '_d1', name: 'Quarterly Report', owner: 'Jordan K', owners: ['Jordan K'],
      project: 'proj1', subCode: 'sc1', due: '2026-08-14', status: 'in-progress',
      relayStage: 0,
      relay: [
        { id: '_st1', kind: 'work', who: 'Jordan K', est: 3, due: '2026-08-05' },
        { id: '_st2', kind: 'review', who: 'Me', est: 2, due: '2026-08-06' }
      ]
    }]
  });

  const readList = () => page.evaluate(() => {
    _switchTab(document.querySelector('.tab[data-tab="tasks"]'));
    renderTasks();
    const list = document.getElementById('taskList');
    const rows = [...list.querySelectorAll('.task-row')];
    const leg = rows.find(r => r.textContent.includes('◖ Review — Quarterly Report'));
    return {
      hasLeg: !!leg,
      grey: leg ? +getComputedStyle(leg).opacity < 1 : null,
      baton: leg ? leg.textContent.includes('Waiting on Jordan K') && leg.textContent.includes('in progress (stage 1/2)') : null,
      est: leg ? leg.querySelector('.task-est')?.textContent.trim() : null,
      noCheckbox: leg ? getComputedStyle(leg.querySelector('.task-check')).visibility === 'hidden' : null,
      mirrorRows: rows.filter(r => r.querySelector('.from-team-badge')).length
    };
  });

  let r = await readList();
  step('future Me leg shows as a grey ◖ row with its date-section hours', r.hasLeg && r.grey && r.est === '2.0h', r);
  step('row names the baton holder and the in-progress stage', r.baton === true, undefined);
  step('row is read-only (hidden checkbox), no mirror task yet', r.noCheckbox === true && r.mirrorRows === 0, r);

  // Clicking the row opens the DELIVERABLE editor
  const rc = await page.evaluate(() => {
    const leg = [...document.querySelectorAll('.task-row')].find(x => x.textContent.includes('◖ Review — Quarterly Report'));
    leg.querySelector('.task-name').click();
    return document.getElementById('editTeamModal').classList.contains('open');
  });
  step('clicking the grey row opens the deliverable editor', rc === true, undefined);
  await page.evaluate(() => closeEditTeamModal());

  // Day-fit bar: the leg's 2h count as planned on its day (matches plannedItems)
  const rp = await page.evaluate(() => {
    const p = plannedItems('2026-08-06', '2026-08-06');
    return { synth: p.filter(i => i._relayFuture).reduce((n, i) => n + i.hours, 0) };
  });
  step('plannedItems still counts the same leg once (2h synthetic)', rp.synth === 2, rp);

  // Advance the baton to the Me leg: grey row retires, mirror task takes over
  const ra = await page.evaluate(() => {
    const ti = teamItems.find(t => t.id === '_d1');
    relayAdvance(ti.id);
    renderTasks();
    const rows = [...document.querySelectorAll('#taskList .task-row')];
    return {
      greyGone: !rows.some(x => x.textContent.includes('◖ Review — Quarterly Report')),
      mirror: rows.filter(x => x.querySelector('.from-team-badge')).length,
      synth: plannedItems('2026-08-01', '2026-08-31').filter(i => i._relayFuture).length
    };
  });
  step('baton arrival: grey row retires, mirror appears exactly once, synthetic entry gone',
    ra.greyGone && ra.mirror === 1 && ra.synth === 0, ra);

  await done(browser);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
