// Task modal cleanup (Sep 2026): the task "Waiting On" field is retired —
// legacy values fold into notes at init (⏳-prefixed, nothing lost) and notes
// render INLINE on the task row in the old waiting-chip yellow. The form
// opens compact: schedule/repeats/team fields live behind toggle buttons,
// and collapsing hides fields WITHOUT clearing them — saving an untouched
// modal must preserve workDate/blocks/recurrence. Notes are a new innerHTML
// sink, so they must render escaped.
const { launch, step, done } = require('./_lib');

(async () => {
  const { browser, page } = await launch({
    wt_active_tab: 'tasks',
    wt_persons: ['Jordan K'],
    wt_tasks: [
      { id: '_t1', name: 'TaskAlpha', project: 'overhead', subCode: '', priority: 'med',
        due: '2027-01-20', workDate: '2027-01-15', est: 2,
        blocks: [{ id: '_b1', date: '2027-01-14', hours: 1, desc: '', done: false }],
        waiting: 'Bob reply', notes: 'call first', timer: 0, timerStart: null, completed: false },
      { id: '_t2', name: 'TaskBeta', project: 'overhead', subCode: '', priority: 'med',
        due: '2027-01-21', est: 1, waiting: 'legal sign-off', notes: '',
        timer: 0, timerStart: null, completed: false },
      { id: '_t3', name: 'TaskGamma', project: 'overhead', subCode: '', priority: 'med',
        due: '2027-01-22', est: 1, waiting: '',
        notes: '<img src=x onerror="window.__notesXss=1">',
        timer: 0, timerStart: null, completed: false }
    ]
  });

  // 1. Init migration: waiting folds into notes, prefixed and lossless.
  let r = await page.evaluate(() => ({
    t1w: tasks.find(t => t.id === '_t1').waiting,
    t1n: tasks.find(t => t.id === '_t1').notes,
    t2w: tasks.find(t => t.id === '_t2').waiting,
    t2n: tasks.find(t => t.id === '_t2').notes,
    stored: JSON.parse(localStorage.getItem('wt_tasks')).find(t => t.id === '_t1').notes
  }));
  step('waiting + notes fold to "⏳ waiting · notes"', r.t1w === '' && r.t1n === '⏳ Bob reply · call first', r.t1n);
  step('waiting-only task folds to "⏳ waiting"', r.t2w === '' && r.t2n === '⏳ legal sign-off', r.t2n);
  step('migration persisted to localStorage', r.stored === '⏳ Bob reply · call first', r.stored);

  // 2. Notes render inline on the row in the waiting-chip yellow, escaped.
  r = await page.evaluate(() => {
    const html = document.getElementById('taskList').innerHTML;
    return {
      inlineChip: html.includes('task-note-inline'),
      noteText: html.includes('⏳ Bob reply · call first'),
      xssFired: window.__notesXss === 1,
      xssEscaped: html.includes('&lt;img') && !document.getElementById('taskList').querySelector('img')
    };
  });
  step('task row shows inline note chip', r.inlineChip && r.noteText, r);
  step('inline note is escHtml-escaped (no live <img>, no handler fired)', r.xssEscaped && !r.xssFired, r);

  // 3. Modal: Waiting On input is gone; option sections open collapsed with
  //    summaries naming what's set inside.
  r = await page.evaluate(() => {
    openEditModal('_t1');
    return {
      waitingInput: !!document.getElementById('editWaiting'),
      schedOpen: document.getElementById('editSecSchedule').classList.contains('open'),
      repeatOpen: document.getElementById('editSecRepeat').classList.contains('open'),
      teamOpen: document.getElementById('editSecTeam').classList.contains('open'),
      schedSum: document.getElementById('editSecSumSchedule').textContent,
      workDateVal: document.getElementById('editWorkDate').value
    };
  });
  step('Waiting On input removed from the task modal', !r.waitingInput, r.waitingInput);
  step('sections start collapsed', !r.schedOpen && !r.repeatOpen && !r.teamOpen, r);
  step('collapsed Schedule button summarizes its contents', /work/.test(r.schedSum) && /1 block/.test(r.schedSum), r.schedSum);
  step('hidden fields still hold their values', r.workDateVal === '2027-01-15', r.workDateVal);

  // 4. Toggling opens a section; saving an untouched modal preserves the
  //    hidden schedule state and never resurrects waiting.
  r = await page.evaluate(() => {
    _editSecToggle('Schedule');
    const opened = document.getElementById('editSecSchedule').classList.contains('open');
    saveEditTask();
    const t = tasks.find(x => x.id === '_t1');
    return { opened, workDate: t.workDate, blocks: (t.blocks || []).length, waiting: t.waiting, notes: t.notes };
  });
  step('section toggle opens', r.opened, r.opened);
  step('save with collapsed sections preserves workDate + blocks', r.workDate === '2027-01-15' && r.blocks === 1, r);
  step('save does not resurrect waiting; notes intact', r.waiting === '' && r.notes === '⏳ Bob reply · call first', r);

  await done(browser);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
