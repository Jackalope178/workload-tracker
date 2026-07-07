// Forward-planning horizon: the person-allocation modal budgets a rolling 12
// months, extends in 6-month steps ("+ 6 more months"), and never hides a
// future month that already holds an allocation — 2027-and-ongoing planning
// must not dead-end at a hardcoded window.
const { launch, step, done } = require('./_lib');

(async () => {
  const now = new Date();
  const far = new Date(now.getFullYear(), now.getMonth() + 20, 1);   // ~20 months out
  const farYM = `${far.getFullYear()}-${String(far.getMonth() + 1).padStart(2, '0')}`;
  const { browser, page } = await launch({
    wt_active_tab: 'team',
    wt_persons: ['Jordan K'],
    wt_projects_meta: { overhead: { label: 'Overhead', color: '#4a7', billingCode: 'T-0', subCodes: [], tags: [] } },
    wt_person_allocs: { [`Jordan K|overhead||${farYM}`]: 10 }
  });

  const r = await page.evaluate(farYM => {
    openPersonAllocModal('Jordan K');
    const yms = () => [...document.querySelectorAll('.pa-month-input')].map(i => i.dataset.ym);
    const first = yms();
    // type into a month, extend, and confirm both the typed value and the list grow
    const inp = document.querySelector('.pa-month-input');
    inp.value = '7.5';
    _paMoreMonths();
    const second = yms();
    _paMoreMonths();
    const third = yms();
    const kept = document.querySelector(`.pa-month-input[data-ym="${first[0]}"]`).value;
    closePersonAllocModal();
    // reopening resets the extension but keeps the stored far-future month
    openPersonAllocModal('Jordan K');
    const reopened = yms();
    closePersonAllocModal();
    return { first, secondLen: second.length, thirdLen: third.length, kept,
      farIncluded: first.includes(farYM), reopenedLen: reopened.length, reopenedFar: reopened.includes(farYM) };
  }, farYM);

  step('default horizon is a rolling 12 months (+ any stored future months)', r.first.length === 13, r.first.length);
  step('a stored ~20-months-out allocation is always listed', r.farIncluded && r.reopenedFar);
  // 18-month window + the far month = 19; the 24-month window then swallows it = 24
  step('+6 more months extends the list (13 → 19 → 24)', r.secondLen === 19 && r.thirdLen === 24, [r.secondLen, r.thirdLen]);
  step('typed-but-unsaved values survive extending', r.kept === '7.5', r.kept);
  step('reopening resets the extension without losing stored months', r.reopenedLen === 13, r.reopenedLen);

  await done(browser);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
