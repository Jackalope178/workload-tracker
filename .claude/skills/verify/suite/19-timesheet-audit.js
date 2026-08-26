// Timesheet audit import: reconciles a source-of-truth spreadsheet against the
// wt_completed billing ledger, code by code and day by day. Invariants:
//   · hours snap to quarter-hours and never go negative; a 0h line bills nothing
//   · comparison is bucket TOTALS per code+date, windowed to the sheet's span
//   · under-logged days are pre-selected, removals are opt-in
//   · an entry locked to a work block / session is never edited or deleted
//   · applying is idempotent — a second pass reads in sync
//   · a hostile job label from the .xlsx never reaches innerHTML unescaped
const { launch, step, done } = require('./_lib');

(async () => {
  const { browser, page } = await launch({
    wt_projects_meta: {
      overhead: { label: 'Overhead', color: '#4a7', billingCode: 'T-0', subCodes: [], tags: [] },
      lib: {
        label: 'Library Program', color: '#60a5fa', billingCode: 'T-26-051',
        subCodes: [{ id: 'sc1', code: '1', label: 'Planning' }, { id: 'sc2', code: '2', label: 'Outreach' }],
        tags: []
      }
    },
    wt_project_order: ['overhead', 'lib'],
    wt_completed: [
      { id: 'c1', name: 'Plan A',  project: 'lib', subCode: 'sc1', dateCompleted: '2026-08-03', estHours: 4, actualHours: 4 },
      { id: 'c2', name: 'Plan B',  project: 'lib', subCode: 'sc1', dateCompleted: '2026-08-04', estHours: 4, actualHours: 2.5 },
      { id: 'c3', name: 'Reach A', project: 'lib', subCode: 'sc2', dateCompleted: '2026-08-05', estHours: 6, actualHours: 6 },
      // Locked: this entry IS the completion record of a work block (invariant #8)
      { id: 'c4', name: 'Reach B', project: 'lib', subCode: 'sc2', dateCompleted: '2026-08-06', estHours: 3, actualHours: 3, _blockRef: 't1_b1' },
      { id: 'c5', name: 'Plan C',  project: 'lib', subCode: 'sc1', dateCompleted: '2026-08-07', estHours: 2, actualHours: 2 },
      // Outside the sheet's span — the audit must not see or touch it
      { id: 'c6', name: 'Old',     project: 'lib', subCode: 'sc1', dateCompleted: '2026-07-01', estHours: 9, actualHours: 9 }
    ]
  });

  const SHEET = [
    ['Date', 'Job', 'Task', 'Hours', 'Notes'],
    ['2026-08-03', 'T-26-051 Library Program', 'Planning', 4,      'kickoff prep'],
    ['08/04/2026', 'T-26-051 Library Program', 'Planning', '4:00', 'drafting'],   // h:mm
    ['2026-08-05', 'T-26-051 Library Program', 'Outreach', '4',    'calls'],
    ['2026-08-06', 'T-26-051 Library Program', 'Outreach', '1h 0m','follow-up'],  // 1h 0m
    ['2026-08-10', 'T-26-051 Library Program', 'Planning', 3,      'workshop'],   // absent from tracker
    ['2026-08-11', 'T-26-051 Library Program', 'Planning', 0,      'cancelled'],  // 0h = bill nothing
    ['2026-08-11', 'B-99-999 Ghost Project',   'Kickoff',  2,      'new code'],   // unmatched project
    ['not a date', 'T-26-051 Library Program', 'Planning', 5,      'junk row']
  ];

  // ── 1. parsers ──
  let r = await page.evaluate(() => ({
    dec: _tsaParseHours(1.5), hmm: _tsaParseHours('1:30'), hm: _tsaParseHours('1h 30m'),
    mins: _tsaParseHours('90m'), junk: _tsaParseHours('abc'), blank: _tsaParseHours(''),
    iso: _tsaParseDate('2026-08-03'), us: _tsaParseDate('08/04/2026'),
    serial: _tsaParseDate(46237), dmy: _tsaParseDate('3-Aug-2026'), mdy: _tsaParseDate('Aug 3, 2026'),
    bad: _tsaParseDate('not a date')
  }));
  step('hours parse: decimal / h:mm / 1h30m / 90m all read 1.5',
    r.dec === 1.5 && r.hmm === 1.5 && r.hm === 1.5 && r.mins === 1.5, r);
  step('non-duration cells return null, not 0', r.junk === null && r.blank === null, { junk: r.junk, blank: r.blank });
  step('dates parse: ISO / US / Excel serial / d-Mon-y / Mon d, y',
    r.iso === '2026-08-03' && r.us === '2026-08-04' && r.serial === '2026-08-03' &&
    r.dmy === '2026-08-03' && r.mdy === '2026-08-03', r);
  step('unreadable date returns null', r.bad === null, r.bad);

  // ── 2. plan build ──
  r = await page.evaluate(sheet => {
    const plan = _buildTsAuditPlan(sheet, _tsaDetectColumns(sheet[0]), sheet[0]);
    _tsAuditPlan = plan;
    return {
      cols: _tsaDetectColumns(sheet[0]),
      rows: plan.rows.length,
      from: plan.dateFrom, to: plan.dateTo,
      skipped: plan.skipped
    };
  }, SHEET);
  step('header auto-detection finds every column',
    r.cols.date === 0 && r.cols.job === 1 && r.cols.task === 2 && r.cols.hours === 3 && r.cols.notes === 4, r.cols);
  step('6 usable lines parsed; 0h line and junk row skipped',
    r.rows === 6 && r.skipped.zero === 1 && r.skipped.noDate === 1, { rows: r.rows, skipped: r.skipped });
  step('window is the sheet\'s own span', r.from === '2026-08-03' && r.to === '2026-08-11', [r.from, r.to]);

  // ── 3. reconciliation ──
  r = await page.evaluate(() => {
    const groups = _tsaComputeGroups(_tsAuditPlan);
    _tsAuditPlan.groupsCache = groups;
    const byKey = k => groups.find(g => g.key === k);
    const sc1 = byKey('lib|sc1'), sc2 = byKey('lib|sc2');
    const day = (g, d) => g.days.find(x => x.date === d);
    return {
      sc1: { sheet: sc1.sheetTotal, trk: sc1.trackerTotal, delta: sc1.delta },
      sc2: { sheet: sc2.sheetTotal, trk: sc2.trackerTotal, delta: sc2.delta },
      d0803: day(sc1, '2026-08-03').status,
      d0804: { s: day(sc1, '2026-08-04').status, delta: day(sc1, '2026-08-04').delta, act: day(sc1, '2026-08-04').action },
      d0807: { s: day(sc1, '2026-08-07').status, act: day(sc1, '2026-08-07').action, can: day(sc1, '2026-08-07').canReduce },
      d0810: { s: day(sc1, '2026-08-10').status, delta: day(sc1, '2026-08-10').delta, act: day(sc1, '2026-08-10').action },
      d0805: { s: day(sc2, '2026-08-05').status, act: day(sc2, '2026-08-05').action, can: day(sc2, '2026-08-05').canReduce },
      d0806: { s: day(sc2, '2026-08-06').status, locked: day(sc2, '2026-08-06').locked, actionable: day(sc2, '2026-08-06').actionable },
      julyLeaked: groups.some(g => g.days.some(d => d.date < '2026-08-03')),
      ghost: groups.some(g => g.isNewProj)
    };
  });
  step('sc1 rolls up sheet 11h vs tracker 8.5h (Δ +2.5)',
    r.sc1.sheet === 11 && r.sc1.trk === 8.5 && r.sc1.delta === 2.5, r.sc1);
  step('sc2 rolls up sheet 5h vs tracker 9h (Δ −4)',
    r.sc2.sheet === 5 && r.sc2.trk === 9 && r.sc2.delta === -4, r.sc2);
  step('equal day reads in sync', r.d0803 === 'match', r.d0803);
  step('under-logged day is +1.5 and pre-selected',
    r.d0804.s === 'under' && r.d0804.delta === 1.5 && r.d0804.act === 'apply', r.d0804);
  step('day absent from the tracker is "missing" and pre-selected',
    r.d0810.s === 'missing' && r.d0810.delta === 3 && r.d0810.act === 'apply', r.d0810);
  step('day logged but absent from the sheet is flagged, NOT auto-removed',
    r.d0807.s === 'extra' && r.d0807.can === true && r.d0807.act === 'skip', r.d0807);
  step('over-logged day is opt-in, never pre-selected',
    r.d0805.s === 'over' && r.d0805.can === true && r.d0805.act === 'skip', r.d0805);
  step('block-locked day is not actionable at any setting',
    r.d0806.locked === true && r.d0806.actionable === false, r.d0806);
  step('entries outside the sheet span never enter the comparison', r.julyLeaked === false, r.julyLeaked);
  step('unmatched job code surfaces as a new-project group', r.ghost === true, r.ghost);

  // ── 4. locked day cannot be forced ──
  r = await page.evaluate(() => {
    const gi = _tsAuditPlan.groupsCache.findIndex(g => g.key === 'lib|sc2');
    const di = _tsAuditPlan.groupsCache[gi].days.findIndex(d => d.date === '2026-08-06');
    _tsaToggleDay(gi, di, true);            // user tries to tick it anyway
    const g = _tsAuditPlan.groupsCache.find(x => x.key === 'lib|sc2');
    return g.days.find(d => d.date === '2026-08-06').action;
  });
  step('ticking a locked day is refused (stays skip)', r === 'skip', r);

  // ── 5. render is XSS-safe against a crafted Job cell ──
  r = await page.evaluate(() => {
    const hostile = [
      ['Date', 'Job', 'Task', 'Hours'],
      ['2026-08-03', '<img src=x onerror=alert(1)> "><script>alert(2)</script>', "'); alert(3); //", 2]
    ];
    _tsAuditPlan = _buildTsAuditPlan(hostile, _tsaDetectColumns(hostile[0]), hostile[0]);
    _tsaRenderPreviewBody();
    const html = document.getElementById('tsaBody').innerHTML;
    return {
      noImg: !/<img\s+src=x/i.test(html),
      noScript: !/<script/i.test(html),
      escaped: html.includes('&lt;img') || html.includes('&amp;lt;img')
    };
  });
  step('hostile job label is escaped, no live <img> in the preview', r.noImg && r.noScript, r);
  step('hostile label still renders (escaped, not dropped)', r.escaped, r.escaped);

  // ── 6. commit with defaults + one opted-in reduction ──
  r = await page.evaluate(sheet => {
    _tsAuditPlan = _buildTsAuditPlan(sheet, _tsaDetectColumns(sheet[0]), sheet[0]);
    _tsAuditPlan.groupsCache = _tsaComputeGroups(_tsAuditPlan);
    const gi = _tsAuditPlan.groupsCache.findIndex(g => g.key === 'lib|sc2');
    const di = _tsAuditPlan.groupsCache[gi].days.findIndex(d => d.date === '2026-08-05');
    _tsaToggleDay(gi, di, true);                 // opt into the −2h reduction
    _commitTsAuditPlan();
    const at = (d, sc) => completed.filter(e => e.dateCompleted === d && e.subCode === sc)
      .reduce((a, e) => a + e.actualHours, 0);
    return {
      d0804: at('2026-08-04', 'sc1'),
      d0810: at('2026-08-10', 'sc1'),
      d0805: at('2026-08-05', 'sc2'),
      d0806: at('2026-08-06', 'sc2'),
      d0807: at('2026-08-07', 'sc1'),
      july: completed.find(e => e.id === 'c6')?.actualHours,
      blockEntryIntact: !!completed.find(e => e.id === 'c4' && e._blockRef === 't1_b1'),
      zeroDay: completed.some(e => e.dateCompleted === '2026-08-11' && e.subCode === 'sc1'),
      ghostProj: Object.values(PROJECTS).find(p => p.billingCode === 'B-99-999')?.label,
      allQuarters: completed.every(e => Math.abs(e.actualHours / 0.25 - Math.round(e.actualHours / 0.25)) < 1e-9),
      noNegative: completed.every(e => e.actualHours >= 0),
      provenance: completed.filter(e => e._tsaRef).length
    };
  }, SHEET);
  step('under-logged day topped up to the sheet (2.5 → 4)', r.d0804 === 4, r.d0804);
  step('missing day created at the sheet value (3h)', r.d0810 === 3, r.d0810);
  step('opted-in reduction applied (6 → 4)', r.d0805 === 4, r.d0805);
  step('block-locked day untouched and still linked', r.d0806 === 3 && r.blockEntryIntact, r);
  step('un-ticked "extra" day left alone (2h still logged)', r.d0807 === 2, r.d0807);
  step('entry outside the sheet span untouched', r.july === 9, r.july);
  step('0h sheet line bills nothing — no phantom quarter-hour', r.zeroDay === false, r.zeroDay);
  step('unmatched code created its project', r.ghostProj === 'Ghost Project', r.ghostProj);
  step('every ledger value is a non-negative quarter-hour', r.allQuarters && r.noNegative, r);
  step('audit-created entries carry provenance (_tsaRef)', r.provenance === 3, r.provenance);

  // ── 7. idempotency: a second pass over the same sheet reads in sync ──
  r = await page.evaluate(sheet => {
    _tsAuditPlan = _buildTsAuditPlan(sheet, _tsaDetectColumns(sheet[0]), sheet[0]);
    const groups = _tsaComputeGroups(_tsAuditPlan);
    const sc1 = groups.find(g => g.key === 'lib|sc1');
    const sc2 = groups.find(g => g.key === 'lib|sc2');
    const day = (g, d) => g.days.find(x => x.date === d);
    return {
      d0804: day(sc1, '2026-08-04').status,
      d0810: day(sc1, '2026-08-10').status,
      d0805: day(sc2, '2026-08-05').status,
      addsPending: groups.reduce((a, g) => a + g.pendingAdd, 0)
    };
  }, SHEET);
  step('re-import: applied days now read in sync',
    r.d0804 === 'match' && r.d0810 === 'match' && r.d0805 === 'match', r);
  step('re-import proposes no duplicate hours', r.addsPending === 0, r.addsPending);

  // ── 8. undo restores the pre-audit ledger exactly ──
  r = await page.evaluate(() => {
    _undoTsAuditImport();
    return {
      count: completed.length,
      d0804: completed.filter(e => e.dateCompleted === '2026-08-04').reduce((a, e) => a + e.actualHours, 0),
      d0805: completed.filter(e => e.dateCompleted === '2026-08-05').reduce((a, e) => a + e.actualHours, 0),
      d0810: completed.some(e => e.dateCompleted === '2026-08-10'),
      ghostGone: !Object.values(PROJECTS).some(p => p.billingCode === 'B-99-999'),
      persisted: JSON.parse(localStorage.getItem('wt_completed')).length
    };
  });
  step('undo restores the original 6 entries', r.count === 6 && r.persisted === 6, r);
  step('undo reverts the top-up and the reduction', r.d0804 === 2.5 && r.d0805 === 6, r);
  step('undo removes the created entry and project', r.d0810 === false && r.ghostGone, r);

  // ── 9. the Timesheet tab actually offers the affordance ──
  r = await page.evaluate(() => {
    _switchTab(document.querySelector('.tab[data-tab="timesheet"]'));
    const panel = document.getElementById('panel-timesheet');
    const input = panel.querySelector('input[type=file][onchange*="handleTsAuditImport"]');
    _tsAuditPlan = _buildTsAuditPlan(
      [['Date', 'Job', 'Hours'], ['2026-08-03', 'T-26-051 Library Program', 4]],
      { date: 0, job: 1, task: -1, hours: 2, notes: -1 }
    );
    _showTsAuditPreview();
    const modal = document.getElementById('tsAuditPreviewModal');
    const open = modal.style.display === 'flex';
    _cancelTsAuditPlan();
    return {
      hasInput: !!input,
      accepts: input ? input.getAttribute('accept') : '',
      opens: open,
      closes: modal.style.display === 'none',
      cleared: _tsAuditPlan === null
    };
  });
  step('Timesheet toolbar exposes the import control', r.hasInput && /xlsx/.test(r.accepts), r);
  step('preview modal opens and Cancel closes it, dropping the plan',
    r.opens && r.closes && r.cleared, r);

  await done(browser);
})();
