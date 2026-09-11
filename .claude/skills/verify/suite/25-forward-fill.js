// Forward fill (Phase 3, Sep 2026): flexible dated work (plain due dates,
// holds, future relay legs) is packed earliest-deadline-first into the free
// room of coming working days; pinned items (work date, spread, blocks,
// recurring occurrences) hold their day and reduce room; time off = 0h,
// weekly overhead comes off each day; delegated-away and undated items never
// enter; overdue items enter as due today. What-if says fits / lands / what
// it would push / the no-displacement date. Nothing writes except 📅 Plan,
// which routes through _capAssignOne + workSpread and refuses recurring.
const { launch, step, done } = require('./_lib');

const pad = n => String(n).padStart(2, '0');
const ds = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const isWd = d => d.getDay() !== 0 && d.getDay() !== 6;
function wd(n) { const d = new Date(); d.setHours(0, 0, 0, 0); while (!isWd(d)) d.setDate(d.getDate() + 1); let k = 0; while (k < n) { d.setDate(d.getDate() + 1); if (isWd(d)) k++; } return ds(d); }
const W = [0, 1, 2, 3, 4, 5, 6].map(wd);

(async () => {
  const { browser, page } = await launch({
    wt_active_tab: 'capacity',
    wt_persons: ['Jordan K'],
    wt_projects_meta: { pa: { label: 'Prog A', color: '#4a7', billingCode: 'T-1', subCodes: [] }, pb: { label: 'Prog B', color: '#a47', billingCode: 'T-2', subCodes: [] } },
    wt_tasks: [
      { id: '_A', name: 'Big A', project: 'pa', subCode: '', priority: 'med', due: W[5], est: 16, completed: false, timer: 0, timerStart: null },
      { id: '_B', name: 'Soon B', project: 'pb', subCode: '', priority: 'med', due: W[2], est: 8, completed: false, timer: 0, timerStart: null },
      { id: '_P', name: 'Pinned P', project: 'pa', subCode: '', priority: 'med', due: W[6], workDate: W[1], est: 4, completed: false, timer: 0, timerStart: null },
      { id: '_O', name: 'Overdue O', project: 'pb', subCode: '', priority: 'high', due: '2020-01-06', est: 2, completed: false, timer: 0, timerStart: null },
      { id: '_D', name: 'Delegated D', project: 'pa', subCode: '', priority: 'med', due: W[1], est: 8, completed: false, timer: 0, timerStart: null, delegatedTo: ['Jordan K'] },
      { id: '_U', name: 'Undated U', project: 'pa', subCode: '', priority: 'med', due: '', est: 5, completed: false, timer: 0, timerStart: null }
    ]
  });

  // 1. EDF packing with a pinned item in the way.
  let r = await page.evaluate(() => {
    const ff = forwardFill();
    const by = k => ff.results.find(x => x.key === k);
    return { keys: ff.results.map(x => x.key), order: ff.results.map(x => x.key),
      O: by('_O') && { plan: by('_O').plan, overdue: by('_O').overdue, atRisk: by('_O').atRisk },
      B: by('_B') && { plan: by('_B').plan, finish: by('_B').finish, atRisk: by('_B').atRisk },
      A: by('_A') && { plan: by('_A').plan, finish: by('_A').finish, atRisk: by('_A').atRisk },
      fixedW1: ff.fixed[ff.days[0] === undefined ? '' : ''] , pinnedDay: ff.fixed, booked: ff.bookedThrough, total: ff.totalFlex, risk: ff.atRisk.length, cap: ff.cap };
  });
  step('delegated-away and undated items never enter; pinned P is load, not flexible', !r.keys.includes('_D') && !r.keys.includes('_U') && !r.keys.includes('_P') && r.keys.length === 3, r.keys);
  step('earliest deadline first: overdue O (due today) → B → A', r.order.join() === '_O,_B,_A', r.order);
  step('O fits today and is not at risk despite being overdue', r.O.overdue && r.O.plan.length === 1 && r.O.plan[0].date === W[0] && r.O.plan[0].hours === 2 && !r.O.atRisk, r.O);
  step('B takes the rest of today (6h) + 2h on day 1, finishing before its day-2 deadline', r.B.plan.length === 2 && r.B.plan[0].hours === 6 && r.B.plan[1].date === W[1] && r.B.plan[1].hours === 2 && !r.B.atRisk, r.B);
  step('pinned P (4h on day 1) reduces room: A gets 2h day 1, 8h day 2, 6h day 3 → done day 3 < day-5 deadline', r.pinnedDay[W[1]] === 4 && r.A.plan.map(p => p.hours).join() === '2,8,6' && r.A.finish === W[3] && !r.A.atRisk, r.A);
  step('placed through = day 3; 26h to place; nothing at risk; room 8h/day', r.booked === W[3] && r.total === 26 && r.risk === 0 && r.cap === 8, r);

  // 2. What-if: fits without displacement / does not fit and names what it pushes.
  r = await page.evaluate((W) => {
    const a = ffWhatIf(8, W[1]);
    const b = ffWhatIf(16, W[1]);
    const c = ffWhatIf(4, '');
    return { a: { fits: a.fits, finish: a.finish, pushed: a.newlyLate.map(x => x.key) }, b: { fits: b.fits, finish: b.finish, pushed: b.newlyLate.map(x => x.key), clean: b.earliestClean }, c: { clean: c.earliestClean, fits: c.fits } };
  }, W);
  step('8h by day 1: Yes, lands day 1, pushes nothing', r.a.fits && r.a.finish === W[1] && r.a.pushed.length === 0, r.a);
  step('16h by day 1: No — earliest day 2; forcing it pushes B late; clean date = day 5', !r.b.fits && r.b.finish === W[2] && r.b.pushed.join() === '_B' && r.b.clean === W[5], r.b);
  // after A there are 2h left on day 3, so 4h lands on day 4
  step('no date given: answers the "after everything" date (day 4)', !r.c.fits && r.c.clean === W[4], r.c);

  // 3. Time off and overhead change the room, for the fill only.
  r = await page.evaluate((W) => {
    timeOff.push({ id: '_off', from: W[2], to: W[2], label: 'Dentist' }); save('wt_time_off', timeOff);
    const ff = forwardFill();
    const A = ff.results.find(x => x.key === '_A');
    const capOff = _ffDayCap(W[2]);
    setOverheadWeekly(10);
    const cap6 = _ffDayCap(W[4]);
    const monthCapUnchanged = (() => { const ms = today().slice(0, 7) + '-01'; const me = localDateStr(new Date(+ms.slice(0, 4), +ms.slice(5, 7), 0)); return workingDays(ms, me) * tsCapacity; })();
    setOverheadWeekly(0);
    timeOff = timeOff.filter(x => x.id !== '_off'); save('wt_time_off', timeOff);
    return { capOff, aFinish: A.finish, booked: ff.bookedThrough, dayOffUsed: !!ff.byDay[W[2]], cap6, monthCapUnchanged, synced: SYNC_KEYS.includes('wt_time_off') && SYNC_KEYS.includes('wt_overhead_weekly'), localOnly: !SYNC_KEYS.includes('wt_ff_open') };
  }, W);
  step('a day off has 0h room and receives nothing; A slides to day 4', r.capOff === 0 && !r.dayOffUsed && r.aFinish === W[4] && r.booked === W[4], r);
  step('10h/week overhead → 6h room per day; the month-bar capacity formula is untouched', r.cap6 === 6 && r.monthCapUnchanged > 0, r);
  step('time off + overhead sync; the details toggle is device-local', r.synced && r.localOnly);

  // 4. Read-only, and the Capacity tab shows the card + answers the what-if.
  r = await page.evaluate((W) => {
    const before = [localStorage.getItem('wt_tasks'), localStorage.getItem('wt_bigprojs')].join('|');
    forwardFill(); ffWhatIf(10, W[3]);
    const same = before === [localStorage.getItem('wt_tasks'), localStorage.getItem('wt_bigprojs')].join('|');
    _switchTab(document.querySelector('.tab[data-tab="capacity"]'));
    const card = document.querySelector('.ff-card');
    document.getElementById('ffHours').value = '16'; document.getElementById('ffBy').value = W[1];
    document.getElementById('ffHours').form.requestSubmit();
    const ans = document.querySelector('.ff-answer');
    return { same, card: !!card, headline: card && card.querySelector('.ff-headline').textContent, answer: ans && ans.textContent };
  }, W);
  step('forwardFill / ffWhatIf never write', r.same);
  step('Capacity tab shows the card with the placed-through date and answers the what-if inline', r.card && r.headline.includes(fmtShort(W[3])) && /^No/.test(r.answer) && r.answer.includes('Soon B'), r);

  // 5. 📅 Plan commits via the placement path; recurring refused.
  r = await page.evaluate(() => {
    ffCommit('task', '_A', '', '');
    const A = tasks.find(t => t.id === '_A');
    const stored = JSON.parse(localStorage.getItem('wt_tasks')).find(t => t.id === '_A');
    const B = tasks.find(t => t.id === '_B'); B.recurrence = { type: 'weekly', daysOfWeek: [1] };
    const bBefore = JSON.stringify(B);
    ffCommit('task', '_B', '', '');
    const bAfter = JSON.stringify(tasks.find(t => t.id === '_B'));
    return { workDate: A.workDate, due: A.due, spread: A.workSpread, storedWd: stored.workDate, recurringUntouched: bBefore === bAfter };
  });
  step('📅 Plan sets A\'s work date to its first placed day (day 1) with a spread to the unchanged deadline', r.workDate === W[1] && r.due === W[5] && r.spread === true && r.storedWd === W[1], r);
  step('a recurring item is never re-placed', r.recurringUntouched);

  await done(browser);

  function fmtShort(d) { const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']; const [y, mo, da] = d.split('-').map(Number); return m[mo - 1] + ' ' + da; }
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
