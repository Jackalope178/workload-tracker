// ▬ Timeline (Phase 4, Sep 2026): rows program → sub-code → item; a bar runs
// from start (explicit `start`, else `createdAt`) to the ◆ deadline; legacy
// items with neither draw the diamond only; recurring tasks show their next
// occurrence; relay deliverables draw one segment per stage in the
// assignee's colour with the current stage outlined and a derived first
// start dashed; `dependsOn` pulls a task's start to its predecessor's due
// date and draws a lead-in; undated items and month holds keep rows as
// chips; completed items hide behind a device-local toggle; the header
// carries the forward-fill load band and a today line; read-only. The task
// form's Start / After fields round-trip and never touch hours math.
const { launch, step, done } = require('./_lib');

const pad = n => String(n).padStart(2, '0');
const ds = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const off = n => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + n); return ds(d); };
const T0 = off(0), P10 = off(10), P20 = off(20), P30 = off(30), M5 = off(-5);

(async () => {
  const { browser, page } = await launch({
    wt_active_tab: 'projects',
    wt_proj_view: '"timeline"',
    wt_persons: ['Jordan K', 'Dana P'],
    wt_projects_meta: { pa: { label: 'Prog A', color: '#4a7', billingCode: 'T-1', subCodes: [{ id: 'sc1', code: '1', label: 'Design' }] } },
    wt_tasks: [
      { id: '_t1', name: 'Dated with entry', project: 'pa', subCode: 'sc1', priority: 'med', due: P20, createdAt: M5, est: 4, completed: false, timer: 0, timerStart: null },
      { id: '_t2', name: 'Legacy no entry', project: 'pa', subCode: 'sc1', priority: 'med', due: P10, est: 2, completed: false, timer: 0, timerStart: null },
      { id: '_t3', name: 'Undated thing', project: 'pa', subCode: '', priority: 'med', due: '', est: 3, completed: false, timer: 0, timerStart: null, inbox: true },
      { id: '_t4', name: 'Held thing', project: 'pa', subCode: '', priority: 'med', due: '', allocMonth: P30.slice(0, 7), est: 6, completed: false, timer: 0, timerStart: null },
      { id: '_t5', name: 'Done thing', project: 'pa', subCode: 'sc1', priority: 'med', due: M5, createdAt: off(-20), est: 1, completed: true, timer: 0, timerStart: null },
      { id: '_t6', name: 'Waits for t1', project: 'pa', subCode: 'sc1', priority: 'med', due: P30, createdAt: M5, dependsOn: '_t1', est: 2, completed: false, timer: 0, timerStart: null },
      { id: '_t7', name: 'Weekly thing', project: 'pa', subCode: 'sc1', priority: 'med', due: off(-30), est: 1, completed: false, timer: 0, timerStart: null, recurrence: { type: 'weekly', daysOfWeek: [new Date().getDay() === 0 ? 1 : new Date().getDay()] } }
    ],
    wt_team: [
      { id: '_d1', name: 'Relay memo', owner: 'Jordan K', owners: ['Jordan K'], project: 'pa', subCode: 'sc1', due: P20, status: 'in-progress', est: 6,
        relay: [{ kind: 'work', who: 'Jordan K', est: 4, due: P10 }, { kind: 'review', who: 'Me', est: 2, due: P20 }], relayStage: 0, activeOwner: 'Jordan K' }
    ]
  });

  // 1. Rows and bars.
  let r = await page.evaluate(([T0, P10, P20, P30, M5]) => {
    _switchTab(document.querySelector('.tab[data-tab="projects"]'));
    const items = _tlItems();
    const by = k => items.find(i => i.key === k);
    const row = k => document.querySelector(`.tl-row[data-key="${k}"] .tl-track`);
    const t1 = row('task:_t1'), t2 = row('task:_t2'), t3 = row('task:_t3'), t4 = row('task:_t4'), t5 = document.querySelector('.tl-row[data-key="task:_t5"]'), t6 = row('task:_t6'), t7 = row('task:_t7'), d1 = row('team:_d1');
    return {
      view: _projView, hasHead: !!document.querySelector('.tl-head .tl-month'), today: !!document.querySelector('.tl-today'), load: document.querySelectorAll('.tl-load').length > 0,
      t1: { bar: !!t1.querySelector('.tl-bar'), dl: !!t1.querySelector('.tl-dl'), start: by('task:_t1').start },
      t2: { bar: !!t2.querySelector('.tl-bar'), dl: !!t2.querySelector('.tl-dl'), start: by('task:_t2').start },
      t3: { undated: t3.querySelector('.tl-undated')?.textContent },
      t4: { hold: t4.querySelector('.tl-hold')?.textContent },
      t5hidden: !t5, doneToggleOff: !_tlShowDone,
      t6: { start: by('task:_t6').start, dep: by('task:_t6').depName, link: !!t6.querySelector('.tl-link'), depBar: !!t6.querySelector('.tl-bar.dep') },
      t7: { recur: !!t7.querySelector('.tl-dl.recur'), bar: !!t7.querySelector('.tl-bar'), end: by('task:_t7').end },
      d1: { segs: [...d1.querySelectorAll('.tl-seg')].map(e => [e.className.replace('tl-seg ', ''), e.textContent.trim()]), n: by('team:_d1').segments.length, s0: by('team:_d1').segments[0], s1: by('team:_d1').segments[1] },
      mirrorRowsAbsent: !document.querySelector('.tl-row[data-key^="task:"] .tl-name[title]')?.textContent.includes('↩'),
      localOnly: !SYNC_KEYS.includes('wt_tl_collapsed') && !SYNC_KEYS.includes('wt_tl_show_done') && !SYNC_KEYS.includes('wt_proj_view')
    };
  }, [T0, P10, P20, P30, M5]);
  step('timeline view renders months, a today line and the forward-fill load band', r.view === 'timeline' && r.hasHead && r.today && r.load, r);
  step('a task with an entry date draws a bar from createdAt to its ◆ deadline', r.t1.bar && r.t1.dl && r.t1.start === M5, r.t1);
  step('a legacy task with no entry date draws the deadline alone', !r.t2.bar && r.t2.dl && r.t2.start === null, r.t2);
  step('undated and held items keep their rows as chips', (r.t3.undated || '').includes('no date') && (r.t3.undated || '').includes('inbox') && (r.t4.hold || '').startsWith('hold'), { t3: r.t3, t4: r.t4 });
  step('completed items are hidden by default (device-local toggle)', r.t5hidden && r.doneToggleOff && r.localOnly, r);
  step('After: the dependent task starts at its predecessor\'s deadline with a dotted lead-in', r.t6.start === P20 && r.t6.dep === 'Dated with entry' && r.t6.link && r.t6.depBar, r.t6);
  step('a recurring task shows its next occurrence as ↻◆ with no bar', r.t7.recur && !r.t7.bar && r.t7.end >= T0, r.t7);
  step('a relay deliverable draws one segment per stage; stage 1 derived (dashed) and current, stage 2 pending, in person colours', r.d1.n === 2 && r.d1.s0.derived && r.d1.s0.state === 'cur' && r.d1.s1.state === 'pend' && r.d1.s1.start === P10 && r.d1.s1.end === P20 && r.d1.segs.length === 2 && r.d1.segs[0][0].includes('cur') && r.d1.segs[0][0].includes('derived') && r.d1.segs[0][1] === 'JK' && r.d1.segs[1][1] === 'KME', r.d1);

  // 2. Done toggle + program collapse + read-only.
  r = await page.evaluate(() => {
    const before = [localStorage.getItem('wt_tasks'), localStorage.getItem('wt_team'), localStorage.getItem('wt_bigprojs')].join('|');
    _tlToggleDone();
    const shown = !!document.querySelector('.tl-row[data-key="task:_t5"].done');
    _tlToggleDone();
    _tlToggleProj('pa');
    const collapsed = !document.querySelector('.tl-row[data-key="task:_t1"]') && document.querySelectorAll('.tl-proj .tl-dl.mini').length > 0;
    _tlToggleProj('pa');
    const after = [localStorage.getItem('wt_tasks'), localStorage.getItem('wt_team'), localStorage.getItem('wt_bigprojs')].join('|');
    return { shown, collapsed, same: before === after, pref: localStorage.getItem('wt_tl_collapsed') };
  });
  step('✓ Done shows completed rows; collapsing a program keeps its deadlines as mini diamonds; nothing is written', r.shown && r.collapsed && r.same && r.pref === '[]', r);

  // 3. Task form: Start / After round-trip; collapsed section never clears them; no hours side effects.
  r = await page.evaluate(([P10, T0]) => {
    openEditModal('_t2');
    const secOpen = document.getElementById('editSecSchedule').classList.contains('open');
    document.getElementById('editStart').value = T0;
    const sel = document.getElementById('editDependsOn');
    const hasT1 = [...sel.options].some(o => o.value === '_t1');
    const hasSelf = [...sel.options].some(o => o.value === '_t2');
    sel.value = '_t1';
    _syncEditSecButtons();
    const summary = document.getElementById('editSecSumSchedule').textContent;
    saveEditTask();
    const t = tasks.find(x => x.id === '_t2');
    const stored = JSON.parse(localStorage.getItem('wt_tasks')).find(x => x.id === '_t2');
    // re-open and save untouched: fields survive
    openEditModal('_t2'); saveEditTask();
    const t2 = tasks.find(x => x.id === '_t2');
    return { secOpen, hasT1, hasSelf, summary, start: t.start, dep: t.dependsOn, storedStart: stored.start, est: t.est, due: t.due, survived: t2.start === T0 && t2.dependsOn === '_t1' };
  }, [P10, T0]);
  step('Start / After live in the collapsed 📅 section, list same-project open tasks (never itself), and summarise on the button', !r.secOpen && r.hasT1 && !r.hasSelf && r.summary.includes('start') && r.summary.includes('after'), r);
  step('saving stores start + dependsOn without touching est/due; an untouched re-save keeps them', r.start === T0 && r.dep === '_t1' && r.storedStart === T0 && r.est === 2 && r.due === P10 && r.survived, r);

  await done(browser);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
