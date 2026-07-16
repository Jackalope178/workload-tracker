// Design invariant #1: the pay-period lens counts LOGGED ONLY (billing
// record); the month/booked lens counts LOGGED + PLANNED (headroom). The two
// must never unify. Asserted via the My-Tasks pay strip vs _monthBookedPct.
const { launch, step, done } = require('./_lib');

(async () => {
  // The app's today() is pinned to America/New_York — compute seed dates in
  // that zone, or a UTC-evening container lands entries in tomorrow's period.
  const [ey, em, ed] = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }).split('-');
  const ym = `${ey}-${em}`;
  const day = String(Math.min(parseInt(ed, 10), 28)).padStart(2, '0');
  const { browser, page } = await launch({
    wt_tasks: [
      { id: '_p1', name: 'Planned only', project: 'overhead', subCode: '', priority: 'med',
        due: `${ym}-${day}`, est: 8, completed: false, timer: 0, timerStart: null }
    ],
    wt_completed: [
      { id: '_c1', name: 'Logged work', project: 'overhead', subCode: '', dateCompleted: `${ym}-${day}`, estHours: 2, actualHours: 2, category: '' }
    ]
  });

  const r = await page.evaluate(ym => {
    const strip = document.getElementById('tasksCapLabel')?.textContent || '';
    return {
      strip,
      loggedInStrip: (strip.match(/([\d.]+)h logged/) || [])[1],
      bookedPct: _monthBookedPct(ym)
    };
  }, ym);

  step('pay-period strip counts logged ONLY (2h — the 8h planned task is invisible to it)',
    parseFloat(r.loggedInStrip) === 2, r.strip);
  // capacity this month is at most ~23 weekdays × 8.8h ≈ 202h; 2h logged alone ≈ 1%.
  // 10h (logged+planned) must push booked% clearly above the logged-only level.
  step('booked % (month lens) includes planned — 10h > 2h-only level',
    r.bookedPct >= Math.ceil((10 / 210) * 100) - 1 && r.bookedPct > Math.round((2 / 180) * 100), r.bookedPct + '%');

  await done(browser);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
