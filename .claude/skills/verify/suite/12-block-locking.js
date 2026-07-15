// Math invariant #8: work blocks bill exactly once and stay locked.
// Logged entries are linked to their block (_blockRef/entryId); un-ticking
// retracts the entry; ▣ rows in Timesheet/Capacity route ✓ to the BLOCK
// completion modal (not the parent's); Move moves the block's own date;
// recurrence conversion refuses while logged blocks exist; done blocks'
// hours are frozen on task save.
const { launch, step, done } = require('./_lib');

(async () => {
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const dayStr = `${ym}-${String(now.getDate()).padStart(2, '0')}`;
  const monthStart = ym + '-01';
  const monthEnd = ym + '-' + String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()).padStart(2, '0');
  const nextYm = now.getMonth() === 11
    ? `${now.getFullYear() + 1}-01`
    : `${now.getFullYear()}-${String(now.getMonth() + 2).padStart(2, '0')}`;
  const dueStr = ym + '-28';

  const { browser, page } = await launch({
    wt_projects_meta: { overhead: { label: 'Overhead', color: '#4a7', billingCode: 'T-0', subCodes: [], tags: [] } },
    wt_tasks: [{
      id: '_t1', name: 'Big doc', project: 'overhead', subCode: '', priority: 'med',
      due: dueStr, est: 5, category: '', waiting: '', notes: '',
      timer: 0, timerStart: null, completed: false,
      blocks: [
        { id: '_b1', date: dayStr, hours: 2, desc: 'draft', done: false },
        { id: '_b2', date: dayStr, hours: 2, desc: 'polish', done: false }
      ]
    }]
  });

  // 1. Log block 1 → entry linked both ways.
  let r = await page.evaluate(() => {
    openBlockCompletionModal('_t1', '_b1');
    confirmComplete();
    const t = tasks.find(t => t.id === '_t1');
    const e = completed[0];
    return { ref: e._blockRef, entryId: t.blocks[0].entryId, eid: e.id, h: e.actualHours };
  });
  step('logged block entry carries _blockRef', r.ref === '_t1__b1', r.ref);
  step('block stores its entryId', r.entryId === r.eid, { entryId: r.entryId, eid: r.eid });
  step('block billed its 2h once', r.h === 2, r.h);

  // 2. Un-tick the logged block → entry retracted, hours planned exactly once.
  r = await page.evaluate(([ms, me]) => {
    openBlockCompletionModal('_t1', '_b1'); // done → un-tick path
    const t = tasks.find(t => t.id === '_t1');
    return {
      entries: completed.length, done: t.blocks[0].done, entryId: t.blocks[0].entryId || null,
      plannedH: plannedItems(ms, me).filter(p => (p.id || '').startsWith('_t1')).reduce((a, p) => a + p.hours, 0)
    };
  }, [monthStart, monthEnd]);
  step('un-tick retracts the ledger entry (no logged+planned double count)', r.entries === 0 && !r.done && !r.entryId, r);
  step('plan is back to the full 5h exactly once (2+2 blocks + 1h remainder)', r.plannedH === 5, r.plannedH);

  // 3. Undo restores both sides.
  r = await page.evaluate(() => {
    _undoDelete();
    const t = tasks.find(t => t.id === '_t1');
    return { entries: completed.length, done: t.blocks[0].done, linked: t.blocks[0].entryId === completed[0]?.id };
  });
  step('undo restores the entry AND the done flag', r.entries === 1 && r.done && r.linked, r);

  // 4. Timesheet outstanding ▣ row and Capacity drill-down ▣ row both act on
  //    THE BLOCK — routing to the parent modal was the close-the-whole-task bug.
  r = await page.evaluate(ym => {
    renderTimesheet();
    const tsHtml = document.body.innerHTML;
    _capYear = parseInt(ym.slice(0, 4), 10);
    _capExpandedMonths.add(ym);
    _capExpandedProjects.add(ym + '|overhead');
    renderCapacity();
    const rows = [...document.querySelectorAll('.cap-item-row')];
    const blockRow = rows.find(el => el.innerHTML.includes('polish'));
    return {
      tsBlockRouted: tsHtml.includes(`openBlockCompletionModal('_t1','_b2')`),
      blockRowHtml: blockRow ? blockRow.innerHTML : null
    };
  }, ym);
  step('timesheet outstanding ▣ row logs ITS block', r.tsBlockRouted, r.tsBlockRouted);
  step('capacity ▣ row: ✓ Done targets the block', !!r.blockRowHtml && r.blockRowHtml.includes(`openBlockCompletionModal('_t1','_b2')`), !!r.blockRowHtml);
  step('capacity ▣ row: Move targets the block', !!r.blockRowHtml && r.blockRowHtml.includes(`capMoveItem('block','_t1','_b2')`), !!r.blockRowHtml);
  step('capacity ▣ row: no whole-task Delegate button', !!r.blockRowHtml && !r.blockRowHtml.includes('capDelegateItem'), !!r.blockRowHtml);

  // 5. capMoveItem('block') moves only the block's date.
  r = await page.evaluate(nextYm => {
    const origPrompt = window.prompt;
    window.prompt = () => nextYm;
    capMoveItem('block', '_t1', '_b2');
    window.prompt = origPrompt;
    const t = tasks.find(t => t.id === '_t1');
    return { bDate: t.blocks[1].date, expected: adjustToWeekday(nextYm + '-15'), due: t.due, workDate: t.workDate || null };
  }, nextYm);
  step('block moves to the next month; parent due/workDate untouched',
    r.bDate === r.expected && r.due === dueStr && !r.workDate, r);

  // 6. Recurrence conversion refuses while a logged block exists.
  r = await page.evaluate(() => {
    openEditModal('_t1');
    document.getElementById('editRecurType').value = 'weekly';
    saveEditTask();
    const t = tasks.find(t => t.id === '_t1');
    return {
      blocks: (t.blocks || []).length, recur: !!t.recurrence,
      stillOpen: document.getElementById('editTaskModal').classList.contains('open')
    };
  });
  step('recurring conversion refused — blocks intact, no recurrence stored', r.blocks === 2 && !r.recur && r.stillOpen, r);

  // 7. saveEditTask leaves a done block's hours untouched (no re-rounding).
  r = await page.evaluate(() => {
    const t = tasks.find(t => t.id === '_t1');
    t.blocks[0].hours = 1.9; // legacy non-quarter value on a DONE block
    save('wt_tasks', tasks);
    openEditModal('_t1');
    document.getElementById('editRecurType').value = '';
    saveEditTask();
    const t2 = tasks.find(t => t.id === '_t1');
    return { doneH: t2.blocks[0].hours, openH: t2.blocks[1].hours };
  });
  step('done block hours frozen on save (1.9 stays 1.9, not re-rounded)', r.doneH === 1.9, r.doneH);
  step('open block still quarter-snaps on save', r.openH === 2, r.openH);

  await done(browser);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
