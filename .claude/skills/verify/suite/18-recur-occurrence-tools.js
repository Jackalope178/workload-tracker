// Recurrence occurrence tools (Aug 2026): the stored anchor only ever moves
// along NATURAL occurrence dates. ⏩ catchUpRecurrence resolves a missed
// backlog via skips (parity preserved, overrides honored); dated recurring
// items refuse month moves (capMoveItem); occurrence actions key by the
// ORIGINAL occurrence date (_occDate) so they work on already-rescheduled
// occurrences; delete-just-this advances skip-aware; and saving the edit
// modal untouched no longer silently re-anchors past missed occurrences.
const { launch, step, done } = require('./_lib');

(async () => {
  const { browser, page } = await launch({});

  const r = await page.evaluate(() => {
    const out = {};
    const dowOf = d => new Date(d + 'T00:00:00').getDay();
    const mkTask = o => Object.assign({
      id: uid(), name: 'x', project: 'overhead', subCode: '', priority: 'med',
      due: '', est: 1, category: '', waiting: '', notes: '', timer: 0,
      timerStart: null, completed: false
    }, o);

    // ── 1. Weekly catch-up: anchor exactly 3 weeks back ──
    const a1 = addDays(today(), -21);
    const t1 = mkTask({ id: '_cu_w', name: 'CU weekly', due: a1,
      recurrence: { type: 'weekly', daysOfWeek: [dowOf(a1)], skips: [], overrides: {} } });
    tasks.push(t1); save('wt_tasks', tasks);
    catchUpRecurrence('_cu_w');
    out.w = { due: t1.due, skips: [...t1.recurrence.skips],
      expectSkips: [a1, addDays(a1, 7), addDays(a1, 14)], expectDue: today() };

    // ── 2. Biweekly catch-up preserves parity (gap stays a multiple of 14) ──
    const a2 = addDays(today(), -21);
    const t2 = mkTask({ id: '_cu_b', name: 'CU biweekly', due: a2,
      recurrence: { type: 'biweekly', daysOfWeek: [dowOf(a2)], skips: [], overrides: {} } });
    tasks.push(t2); save('wt_tasks', tasks);
    catchUpRecurrence('_cu_b');
    out.b = { due: t2.due, skips: [...t2.recurrence.skips],
      expectDue: addDays(a2, 28), expectSkips: [a2, addDays(a2, 14)],
      gapDays: Math.round((new Date(t2.due + 'T00:00:00') - new Date(a2 + 'T00:00:00')) / 86400000) };

    // ── 3. Catch-up honors overrides: a missed natural date rescheduled into
    //      the future is NOT skipped — it becomes the new anchor ──
    const a3 = addDays(today(), -14);
    const movedTo = addDays(today(), 3);
    const t3 = mkTask({ id: '_cu_o', name: 'CU override', due: a3,
      recurrence: { type: 'weekly', daysOfWeek: [dowOf(a3)], skips: [],
        overrides: { [addDays(a3, 7)]: movedTo } } });
    tasks.push(t3); save('wt_tasks', tasks);
    catchUpRecurrence('_cu_o');
    out.o = { due: t3.due, expectDue: addDays(a3, 7), skips: [...t3.recurrence.skips],
      expectSkips: [a3], ovrKept: t3.recurrence.overrides[addDays(a3, 7)] === movedTo };

    // ── 4. capMoveItem refuses dated recurring (would re-anchor the series)
    //      but still moves recurring MONTH HOLDS (re-parks the start month) ──
    window.prompt = () => '2031-05';
    const dueBefore = t1.due;
    capMoveItem('task', '_cu_w');
    out.mvBlocked = { due: t1.due, unchanged: t1.due === dueBefore, alloc: t1.allocMonth || null };
    const t4 = mkTask({ id: '_cu_h', name: 'CU hold', due: '', allocMonth: today().slice(0, 7),
      est: 2, recurrence: { type: 'monthly' } });
    tasks.push(t4); save('wt_tasks', tasks);
    capMoveItem('task', '_cu_h');
    out.mvHold = { alloc: t4.allocMonth, due: t4.due };

    // ── 5. Delete-just-this advances SKIP-AWARE (anchor never parks on a
    //      date already in recurrence.skips) ──
    const a5 = addDays(today(), 7);
    const t5 = mkTask({ id: '_cu_d', name: 'CU del', due: a5,
      recurrence: { type: 'weekly', daysOfWeek: [dowOf(a5)], skips: [addDays(a5, 7)], overrides: {} } });
    tasks.push(t5); save('wt_tasks', tasks);
    _deleteRecurState = { taskId: '_cu_d', occurrenceDate: a5 };
    _confirmDeleteRecur('this');
    out.del = { due: t5.due, expect: addDays(a5, 14), skips: [...t5.recurrence.skips] };

    // ── 6. plannedItems exposes _occDate; skipping an already-rescheduled
    //      occurrence keys by the ORIGINAL date and actually removes it ──
    const a6 = addDays(today(), 7);
    const moved6 = addDays(today(), 9);
    const t6 = mkTask({ id: '_cu_t', name: 'CU ts', due: a6,
      recurrence: { type: 'weekly', daysOfWeek: [dowOf(a6)], skips: [], overrides: { [a6]: moved6 } } });
    tasks.push(t6); save('wt_tasks', tasks);
    const win = () => plannedItems(today(), addDays(today(), 21)).filter(p => p.id === '_cu_t_' + a6);
    const occ = win()[0] || null;
    out.ts = { found: !!occ, date: occ && occ.date, occDate: occ && occ._occDate };
    if (occ) skipRecurOccurrence('_cu_t', occ._occDate);
    out.ts.goneAfterSkip = win().length === 0;
    out.ts.skips = [...t6.recurrence.skips];

    // ── 7. Edit-modal honesty: opening + saving untouched keeps the anchor
    //      (missed backlog stays visible); an explicit date change writes ──
    const a7 = addDays(today(), -7);
    const t7 = mkTask({ id: '_cu_e', name: 'CU edit', due: a7,
      recurrence: { type: 'weekly', daysOfWeek: [dowOf(a7)], skips: [], overrides: {} } });
    tasks.push(t7); save('wt_tasks', tasks);
    openEditModal('_cu_e');
    out.edit = {
      shown: document.getElementById('editDue').value,
      missedRowShown: document.getElementById('editRecurMissedRow').style.display !== 'none',
      anchor: a7, expectShown: today()
    };
    saveEditTask();
    out.edit.dueAfterUntouchedSave = t7.due;
    openEditModal('_cu_e');
    const newDate = addDays(today(), 30);
    document.getElementById('editDue').value = newDate;
    saveEditTask();
    out.edit.dueAfterExplicitChange = t7.due;
    out.edit.newDate = newDate;

    // ── 8. Overdue recurring rows render the ⏩ catch-up affordance ──
    const a8 = addDays(today(), -7);
    tasks.push(mkTask({ id: '_cu_u', name: 'CU ui', due: a8,
      recurrence: { type: 'weekly', daysOfWeek: [dowOf(a8)], skips: [], overrides: {} } }));
    save('wt_tasks', tasks);
    renderTasks();
    out.ui = { catchUpBtn: !!document.querySelector('#taskList button[onclick*="catchUpRecurrence"]') };

    return out;
  });

  step('weekly catch-up: 3 missed recorded as skips', JSON.stringify(r.w.skips) === JSON.stringify(r.w.expectSkips), r.w.skips);
  step('weekly catch-up: anchor lands on today (natural date)', r.w.due === r.w.expectDue, `${r.w.due} vs ${r.w.expectDue}`);
  step('biweekly catch-up: parity preserved (gap % 14 === 0)', r.b.gapDays % 14 === 0 && r.b.due === r.b.expectDue, `gap ${r.b.gapDays}d, due ${r.b.due}`);
  step('biweekly catch-up: only the 2 missed skipped', JSON.stringify(r.b.skips) === JSON.stringify(r.b.expectSkips), r.b.skips);
  step('catch-up keeps a future-moved occurrence (anchor = its natural date)', r.o.due === r.o.expectDue && r.o.ovrKept, `due ${r.o.due}`);
  step('catch-up skips only truly-missed dates around the override', JSON.stringify(r.o.skips) === JSON.stringify(r.o.expectSkips), r.o.skips);
  step('capMoveItem refuses a dated recurring series (anchor unchanged)', r.mvBlocked.unchanged && !r.mvBlocked.alloc, r.mvBlocked.due);
  step('capMoveItem still re-parks a recurring month hold', r.mvHold.alloc === '2031-05' && r.mvHold.due === '', r.mvHold);
  step('delete-just-this advances past already-skipped dates', r.del.due === r.del.expect, `${r.del.due} vs ${r.del.expect}`);
  step('plannedItems occurrence carries _occDate (orig) + effective date', r.ts.found && r.ts.occDate !== r.ts.date && r.ts.date > r.ts.occDate, r.ts);
  step('skip keyed by _occDate removes a rescheduled occurrence', r.ts.goneAfterSkip && r.ts.skips.length === 1, r.ts.skips);
  step('edit modal shows next upcoming + missed banner', r.edit.shown === r.edit.expectShown && r.edit.missedRowShown, r.edit.shown);
  step('untouched save keeps the stale anchor (no silent re-anchor)', r.edit.dueAfterUntouchedSave === r.edit.anchor, r.edit.dueAfterUntouchedSave);
  step('explicit date change still re-anchors the series', r.edit.dueAfterExplicitChange === r.edit.newDate, r.edit.dueAfterExplicitChange);
  step('overdue recurring row renders ⏩ catch-up', r.ui.catchUpBtn);

  await done(browser);
})();
