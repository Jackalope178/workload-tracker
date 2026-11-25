// Proposals tab (Nov 2026): a what-if lens that stacks proposal hours on top
// of the existing plate. Invariants: it never creates tasks and nothing in
// plannedItems reads it; the "Just me" baseline IS the Capacity month number
// (logged + planned); the routine estimate fills only months where Capacity
// has no recurring hours on the routine project (never on top); dollars =
// hours × the person's consulting rate in the month worked; the seed import is
// idempotent (proposal name / proposal+person+month) and treats the file as
// untrusted; awarded draws solid, idea/submitted hatched; "Whole team" has no
// capacity line; handlers carry indices only (hostile names cannot break out).
const { launch, step, done } = require('./_lib');

const Y = new Date().getFullYear() + 1;
const ym = m => Y + '-' + String(m).padStart(2, '0');
// first Monday of March next year
const d = new Date(Y, 2, 1); while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
const firstMon = ym(3) + '-' + String(d.getDate()).padStart(2, '0');
const EVIL = '<img src=x onerror="window.__xss=1">';

const SEED = {
  people: [{ name: 'Ann Able', consulting_rate: 100 }, { name: 'Bo Baker', consulting_rate: 200 }, { name: 'x"><img src=x onerror="window.__xss=1">', consulting_rate: 10 }],
  team_baseline: [{ person: 'Team routine', month: ym(2), hours: 30 }, { person: 'Team routine', month: 'not-a-month', hours: 9 }],
  ['ann_routine_work_' + Y + '_estimate']: { by_quarter: { A: [30, 60, 0, 0], B: [30, 0, 0, 0] } },
  proposals: [
    { name: 'Short and heavy', funder: 'City', status: 'idea', award_amount: 3000, start_month: ym(1), end_month: ym(2),
      hours: [{ person: 'Ann Able', month: ym(1), hours: 10 }, { person: 'Ann Able', month: ym(2), hours: 20 }, { person: 'Bo Baker', month: ym(2), hours: 5 },
        { person: 'Ann Able', month: 'bad', hours: 99 }, { person: 'Bo Baker', month: ym(3), hours: -4 }] },
    { name: 'Money only', funder: 'Foundation', status: 'awarded', award_amount: 5000, hours: [] },
    { name: 'Won work', funder: 'Bank', status: 'awarded', award_amount: 800, hours: [{ person: 'Ann Able', month: ym(4), hours: 400 }] },
    { name: EVIL, funder: EVIL, status: 'bogus', award_amount: 'lots', color: '"><script>', notes: EVIL,
      hours: [{ person: 'x"><img src=x onerror="window.__xss=1">', month: ym(5), hours: 3 }] }
  ]
};

(async () => {
  const { browser, page } = await launch({
    wt_active_tab: 'proposals',
    wt_projects_meta: { cwc: { label: 'Routine Prog', color: '#4a7', billingCode: 'T-1', subCodes: [] }, oth: { label: 'Other', color: '#a47', billingCode: 'T-2', subCodes: [] } },
    wt_tasks: [
      { id: '_R', name: 'Weekly routine', project: 'cwc', subCode: '', priority: 'med', due: firstMon, est: 2, completed: false, timer: 0, timerStart: null,
        recurrence: { type: 'weekly', daysOfWeek: [1], skips: [], overrides: {} } },
      { id: '_O', name: 'One-off in Jan', project: 'cwc', subCode: '', priority: 'med', due: ym(1) + '-12', est: 6, completed: false, timer: 0, timerStart: null }
    ],
    wt_bigprojs: [], wt_team: [], wt_completed: []
  });

  // 1. The tab exists between Capacity and Allocations and renders its zones.
  let r = await page.evaluate(() => ({
    order: [...document.querySelectorAll('.tab')].map(t => t.dataset.tab),
    active: document.getElementById('panel-proposals').classList.contains('active'),
    svgs: document.querySelectorAll('#propContent svg').length,
    sync: ['wt_proposals', 'wt_prop_people', 'wt_prop_baseline'].every(k => SYNC_KEYS.includes(k)),
    local: !SYNC_KEYS.includes('wt_prop_mode') && !SYNC_KEYS.includes('wt_prop_year'),
    help: !!INFO_COPY.proposals && !!_TAB_TIPS.proposals
  }));
  step('Proposals tab sits between Capacity and Allocations and is restorable as the active tab', r.order.indexOf('proposals') === r.order.indexOf('capacity') + 1 && r.order.indexOf('allocations') === r.order.indexOf('proposals') + 1 && r.active, r.order);
  step('renders the hours chart and the dollars strip; data keys sync, view keys stay device-local; help copy exists', r.svgs === 2 && r.sync && r.local && r.help, r);

  // 2. Seed import: idempotent, sanitising, never touches tasks.
  r = await page.evaluate((SEED) => {
    const tasksBefore = JSON.stringify(tasks), plannedBefore = plannedItems('2000-01-01', '2100-01-01').length;
    const a = propApplySeed(SEED);
    const snap = JSON.stringify([proposals, propPeople, propBase]);
    const b = propApplySeed(SEED);
    const evil = proposals[3];
    return { a, b, same: snap === JSON.stringify([proposals, propPeople, propBase]), n: proposals.length, people: propPeople.length,
      hrs: proposals.map(p => p.hours.length), tasksSame: tasksBefore === JSON.stringify(tasks),
      plannedSame: plannedBefore === plannedItems('2000-01-01', '2100-01-01').length,
      evil: { status: evil.status, award: evil.awardAmount, color: evil.color }, me: _propMe(), team: propBase.team.length,
      stored: !!localStorage.getItem('wt_proposals') };
  }, SEED);
  step('first import adds 4 proposals; a second import adds none and changes nothing', r.a.added === 4 && r.b.added === 0 && r.b.updated === 4 && r.same && r.n === 4 && r.people === 3, { a: r.a, b: r.b, same: r.same });
  step('bad months and negative hours are dropped; bogus status → idea, non-numeric award → empty, colour is a palette slot', r.hrs.join() === '3,0,1,1' && r.team === 1 && r.evil.status === 'idea' && r.evil.award === null && Number.isInteger(r.evil.color), r);
  step('importing never creates or changes tasks, and plannedItems cannot see proposals', r.tasksSame && r.plannedSame && r.stored, r);
  step('"me" is detected from the routine-estimate key (ann_… → Ann Able)', r.me === 'Ann Able', r.me);

  // 3. Hours and dollars math, both modes.
  r = await page.evaluate((Y) => {
    _propYear = Y; _propMode = 'me'; renderProposals();
    const me = _propStacks();
    const pick = (st, i) => st.hours[i].segs.filter(s => s.slot !== undefined).reduce((a, s) => a + s.v, 0);
    _propMode = 'team'; const tm = _propStacks(); _propMode = 'me';
    return { meJan: pick(me, 0), meFeb: pick(me, 1), tmFeb: pick(tm, 1), dMeFeb: me.dollars[1].total, dTmFeb: tm.dollars[1].total,
      tmLine: tm.hours[1].line, meLine: me.hours[1].line, teamBase: tm.hours[1].segs.find(s => s.label === 'Team routine')?.v,
      meHasTeam: me.hours[1].segs.some(s => s.label === 'Team routine'),
      aprAwarded: me.dollars[3].awarded, aprTotal: me.dollars[3].total, febAwarded: me.dollars[1].awarded };
  }, Y);
  step('Just me counts only my proposal hours (Jan 10, Feb 20); Whole team counts everyone (Feb 25)', r.meJan === 10 && r.meFeb === 20 && r.tmFeb === 25, r);
  step('dollars = hours × consulting rate in the month worked (Feb: me $2,000, team $3,000)', r.dMeFeb === 2000 && r.dTmFeb === 3000, r);
  step('team baseline is added in Whole team only, and Whole team has no capacity line', r.teamBase === 30 && !r.meHasTeam && r.tmLine === null && r.meLine > 0, r);
  step('awarded dollars are tracked apart from not-yet-awarded ones', r.aprAwarded === 40000 && r.aprTotal === 40000 && r.febAwarded === 0, r);

  // 4. Baseline = the Capacity number; the estimate never stacks on recurring hours.
  r = await page.evaluate((Y) => {
    const capNum = i => {
      const ms = Y + '-' + String(i + 1).padStart(2, '0') + '-01', me = localDateStr(new Date(Y, i + 1, 0));
      return allTsEntries().filter(e => e.date >= ms && e.date <= me).reduce((a, e) => a + e.actualHours, 0) + plannedItems(ms, me).reduce((a, p) => a + p.hours, 0);
    };
    const run = rp => { propBase.routineProj = rp; _propBaseCache = null; return _propBaseData().map(x => ({ capH: x.capH, est: x.est, recur: x.recur })); };
    const off = run(''), on = run('cwc'), other = run('oth'), always = run('*');
    const capOk = on.every((x, i) => Math.abs(x.capH - capNum(i)) < 1e-9);
    return { capOk, jan: on[0], mar: on[2], offEst: off.map(x => x.est), onEst: on.map(x => x.est), otherEst: other.map(x => x.est), alwaysEst: always.map(x => x.est) };
  }, Y);
  step('the grey base equals the Capacity month number (logged + planned) for every month', r.capOk && r.jan.capH === 6 && r.mar.capH > 0, { jan: r.jan, mar: r.mar });
  step('no routine project chosen → the estimate is not used at all', r.offEst.every(v => v === 0), r.offEst);
  step('estimate fills only months with no RECURRING hours on the routine project (Jan–Feb: 20 each; Mar has recurring → 0); a one-off task does not suppress it', r.onEst[0] === 20 && r.onEst[1] === 20 && r.onEst[2] === 0 && r.onEst[3] === 0 && r.onEst[5] === 0, r.onEst);
  step('a different routine project (no recurring hours) and "always use" both fill every estimated month', r.otherEst.slice(0, 6).join() === '20,20,20,20,20,20' && r.alwaysEst.slice(0, 6).join() === '20,20,20,20,20,20', r);

  // 5. Rendering: over-capacity label, hatched vs solid, award-vs-hours numbers, no XSS.
  r = await page.evaluate(() => {
    propSetRoutineProj(Object.keys(PROJECTS).indexOf('cwc') + 2); _propMode = 'me'; proposals.forEach(p => _propOpen.add(p.id)); _propSettingsOpen = true; renderProposals();
    const h = document.getElementById('propHoursChart');
    const over = [...h.querySelectorAll('text.over')].map(t => t.textContent);
    const fills = [...h.querySelectorAll('rect:not(.hit)')].map(x => x.getAttribute('fill'));
    const dash = h.querySelectorAll('line[stroke-dasharray]').length;
    const nums = i => document.getElementById('propNums_' + i).textContent;
    const out = { over, hatched: fills.some(f => f === 'url(#pH' + proposals[0].color + ')'), solid: fills.includes(PROP_COLORS[proposals[2].color]), dash,
      n0: nums(0), n1: nums(1), n2: nums(2), imgs: document.querySelectorAll('#panel-proposals img').length, xss: window.__xss,
      nameShown: document.querySelector('#propHd_3 .prop-name').textContent };
    propSetMode('team');
    const h2 = document.getElementById('propHoursChart');
    out.teamOver = h2.querySelectorAll('text.over').length; out.teamDash = h2.querySelectorAll('line[stroke-dasharray]').length;
    propSetMode('me');
    return out;
  });
  step('Just me labels the over-capacity month in red ("+N h") and draws the capacity line; Whole team does neither', r.over.length === 1 && /^\+[\d.]+ h$/.test(r.over[0]) && r.dash === 12 && r.teamOver === 0 && r.teamDash === 0, r);
  step('idea/submitted segments are hatched, awarded segments are solid', r.hatched && r.solid, r);
  step('hours cost more than the award → warning with the negative difference', /\$4,000/.test(r.n0) && /−\$1,000/.test(r.n0) && /Hours cost more than the award pays/.test(r.n0), r.n0);
  step('money with no hours → "+$5,000 Not tied to hours"; a person with no rate problem is not flagged', /\+\$5,000/.test(r.n1) && /Not tied to hours/.test(r.n1) && !/no rate/.test(r.n0), r.n1);
  step('hostile names/funders/notes/person names render as text — no injected elements, no script run', r.imgs === 0 && r.xss === undefined && r.nameShown.includes('<img'), { imgs: r.imgs, xss: r.xss });

  // 6. Driving the real UI: typing a cell redraws both charts; the checkbox excludes; arrows page years.
  const cell = page.locator('#propRow_0 input.prop-cell').nth(2);   // Ann Able, March
  await cell.fill('12');
  await page.waitForTimeout(700);
  r = await page.evaluate((Y) => {
    const st = _propStacks(), mar = st.hours[2].segs.filter(s => s.slot !== undefined).reduce((a, s) => a + s.v, 0);
    const stored = JSON.parse(localStorage.getItem('wt_proposals'))[0].hours.find(h => h.month === Y + '-03');
    return { mar, d: st.dollars[2].total, stored: stored && stored.hours, focus: document.activeElement.classList.contains('prop-cell'),
      head: document.querySelectorAll('#propHd_0 .prop-num')[1].textContent, tasks: tasks.length };
  }, Y);
  step('typing 12 in a cell updates the chart, the dollars and the row total at once, keeps focus, and is saved', r.mar === 12 && r.d === 1200 && r.stored === 12 && r.focus && r.head === '47 h' && r.tasks === 2, r);
  await page.locator('#propHd_0 input[type=checkbox]').uncheck();
  r = await page.evaluate(() => {
    const st = _propStacks();
    return { jan: st.hours[0].segs.filter(s => s.slot !== undefined).length, inc: proposals[0].included, off: document.getElementById('propRow_0').classList.contains('off') };
  });
  step('unticking a proposal removes it from the what-if without deleting it', r.jan === 0 && r.inc === false && r.off, r);
  await page.locator('#panel-proposals button[aria-label="Next year"]').click();
  r = await page.evaluate(() => ({ y: _propYear, label: document.getElementById('propYearLabel').textContent, saved: JSON.parse(localStorage.getItem('wt_prop_year')) }));
  step('the year arrows page the window', r.y === Y + 1 && r.label === String(Y + 1) && r.saved === Y + 1, r);

  // 7. Reload: everything survives through load().
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  r = await page.evaluate(() => ({ n: proposals.length, mar: proposals[0].hours.length, me: _propMe(), rp: propBase.routineProj, xss: window.__xss }));
  step('state survives a reload (4 proposals, the typed hours, me, routine project) with nothing executed', r.n === 4 && r.mar === 4 && r.me === 'Ann Able' && r.rp === 'cwc' && r.xss === undefined, r);

  await done(browser);
})();
