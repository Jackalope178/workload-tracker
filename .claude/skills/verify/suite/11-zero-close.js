// Zero-billable close-out: 0 in the completion modal means "bill nothing" —
// never a forced 0.25 phantom entry. Blocks logged earlier keep their ledger
// rows; a block closed at 0h is cancelled (no entry); a task closed at 0h
// archives a 0h entry so the Allocations actuals stay exact.
const { launch, step, done } = require('./_lib');

(async () => {
  const { browser, page } = await launch({
    wt_projects_meta: { overhead: { label: 'Overhead', color: '#4a7', billingCode: 'T-0', subCodes: [], tags: [] } },
    wt_tasks: [
      {
        id: '_t1', name: 'Big doc', project: 'overhead', subCode: '', priority: 'med',
        due: '2026-07-20', est: 4, category: '', waiting: '', notes: '',
        timer: 0, timerStart: null, completed: false,
        blocks: [
          { id: '_b1', date: '2026-07-14', hours: 2, desc: 'draft', done: false },
          { id: '_b2', date: '2026-07-16', hours: 2, desc: 'polish', done: false }
        ]
      },
      {
        id: '_t2', name: 'Cancelled thing', project: 'overhead', subCode: '', priority: 'med',
        due: '2026-07-21', est: 1.5, category: '', waiting: '', notes: '',
        timer: 0, timerStart: null, completed: false
      }
    ]
  });

  // 1. Log block 1 at its planned 2h — one real ledger entry.
  let r = await page.evaluate(() => {
    openBlockCompletionModal('_t1', '_b1');
    confirmComplete(); // prefilled with the block's 2h
    const t = tasks.find(t => t.id === '_t1');
    return { entries: completed.map(c => ({ h: c.actualHours, d: c.dateCompleted })), b1done: t.blocks[0].done };
  });
  step('logging a block bills its hours once', r.entries.length === 1 && r.entries[0].h === 2 && r.entries[0].d === '2026-07-14', r.entries);
  step('block 1 marked done', r.b1done);

  // 2. Close block 2 at 0h — cancelled: done, but NO ledger entry.
  r = await page.evaluate(() => {
    openBlockCompletionModal('_t1', '_b2');
    document.getElementById('compBillable').value = '0';
    confirmComplete();
    const t = tasks.find(t => t.id === '_t1');
    return {
      count: completed.length, b2done: t.blocks[1].done,
      planned: plannedItems('2026-07-01', '2026-07-31').filter(p => (p.id || '').startsWith('_t1'))
    };
  });
  step('0h block closes with NO entry — no phantom 0.25', r.count === 1, r.count);
  step('cancelled block marked done', r.b2done);
  step('cancelled block leaves the plan (no _t1 hours remain planned)', r.planned.length === 0, r.planned);

  // 3. Close the fully-blocked parent: prefill must be 0 (snapQuarter — the
  //    roundToQuarter floor would invent 0.25) and confirming bills nothing.
  r = await page.evaluate(() => {
    openCompletionModal('_t1');
    const prefill = document.getElementById('compBillable').value;
    const btn = document.getElementById('compConfirmBtn').textContent;
    confirmComplete();
    return { prefill, btn, entries: completed.map(c => ({ n: c.name, h: c.actualHours })), gone: !tasks.some(t => t.id === '_t1') };
  });
  step('fully-blocked task prefills 0h remainder (not 0.25)', parseFloat(r.prefill) === 0, r.prefill);
  step('confirm button announces the 0h close', /0h/.test(r.btn), r.btn);
  step('task archives at 0h — logged blocks keep their entries', r.gone && r.entries.length === 2 && r.entries.some(e => e.h === 0), r.entries);

  // 4. Typed 0 on a plain task also bills nothing.
  r = await page.evaluate(() => {
    openCompletionModal('_t2');
    document.getElementById('compBillable').value = '0';
    confirmComplete();
    const idx = _getActualsIndex();
    return {
      gone: !tasks.some(t => t.id === '_t2'),
      total: completed.reduce((a, c) => a + (c.actualHours || 0), 0),
      alloc: idx.byProject['overhead|2026-07'] || 0
    };
  });
  step('typed 0 completes without billing (no 0.25 clamp)', r.gone && r.total === 2, r.total);
  step('Allocations actuals see exactly the logged block hours', r.alloc === 2, r.alloc);

  await done(browser);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
