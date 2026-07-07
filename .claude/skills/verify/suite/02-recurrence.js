// Math invariant #1: recurrence must strictly advance. Stepping any pattern
// repeatedly must always move forward (the monotonic guard returns null
// rather than a non-advancing date), and nextActiveRecurrenceAfter steps
// past recurrence.skips.
const { launch, step, done } = require('./_lib');

(async () => {
  const { browser, page } = await launch({});

  const r = await page.evaluate(() => {
    const out = {};
    const walk = (task, start, n) => {
      const dates = [];
      let d = start;
      for (let i = 0; i < n; i++) {
        d = nextRecurrenceAfter(task, d);
        if (d == null) break;
        dates.push(d);
      }
      return dates;
    };
    const strictlyIncreasing = a => a.every((d, i) => i === 0 || d > a[i - 1]);
    const validDates = a => a.every(d => /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(new Date(d + 'T00:00:00')));

    // Month-end patterns — the classic wrap traps
    const lastDay = { due: '2026-01-31', recurrence: { type: 'monthly-last-day', weekdayAdjust: false } };
    out.lastDay = walk(lastDay, '2026-01-31', 24);
    const day31 = { due: '2026-01-31', recurrence: { type: 'monthly-date', dayOfMonth: 31, weekdayAdjust: false } };
    out.day31 = walk(day31, '2026-01-31', 24);
    const day29 = { due: '2027-01-29', recurrence: { type: 'monthly-date', dayOfMonth: 29, weekdayAdjust: false } };
    out.day29 = walk(day29, '2027-01-29', 24);   // hits non-leap Feb 2027
    // Weekday-adjusted month-end (adjusts to previous Friday on weekends)
    const adj = { due: '2026-01-31', recurrence: { type: 'monthly-date', dayOfMonth: 31, weekdayAdjust: true } };
    out.adj = walk(adj, '2026-01-31', 24);
    // Bi-weekly multi-day
    const biweekly = { due: '2026-07-06', recurrence: { type: 'biweekly', daysOfWeek: [1, 4] } };
    out.biweekly = walk(biweekly, '2026-07-06', 30);
    // Monthly-weekday (3rd Tuesday)
    const mw = { due: '2026-07-21', recurrence: { type: 'monthly-weekday', weekOfMonth: 3, dayOfWeek: 2 } };
    out.mw = walk(mw, '2026-07-21', 24);
    // Skips: nextActiveRecurrenceAfter must step past skipped dates
    const skipTask = { due: '2026-07-06', recurrence: { type: 'weekly', daysOfWeek: [1], skips: ['2026-07-13', '2026-07-20'] } };
    out.afterSkips = nextActiveRecurrenceAfter(skipTask, '2026-07-06');

    out.checks = {};
    for (const k of ['lastDay', 'day31', 'day29', 'adj', 'biweekly', 'mw']) {
      out.checks[k] = { n: out[k].length, inc: strictlyIncreasing(out[k]), valid: validDates(out[k]) };
    }
    return out;
  });

  for (const [k, c] of Object.entries(r.checks)) {
    step(`${k}: ${c.n} occurrences, strictly increasing + valid dates`, c.n >= 20 && c.inc && c.valid, r[k].slice(0, 3).join(', ') + ' …');
  }
  step('monthly-last-day lands on real month ends', r.lastDay[0] === '2026-02-28' && r.lastDay[1] === '2026-03-31', r.lastDay.slice(0, 2));
  step('day-31 pattern never fabricates invalid dates in short months',
    r.day31.every(d => !d.endsWith('-02-31') && !d.endsWith('-04-31') && !d.endsWith('-06-31')), r.day31.slice(0, 4));
  step('nextActiveRecurrenceAfter steps past skips (Jul 13 + 20 skipped → Jul 27)', r.afterSkips === '2026-07-27', r.afterSkips);

  await done(browser);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
