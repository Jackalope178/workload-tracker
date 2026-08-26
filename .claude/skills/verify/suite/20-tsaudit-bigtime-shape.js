// The timesheet audit against a real BigTime "Timesheet Detail" export shape:
//   Project | Staff Member | Category | Date | Input | N/C | Notes
// Content here is anonymized, but every structural quirk is the real one —
// "Input" as the hours header, a bare "Category" that the export leaves EMPTY,
// dates as Date objects, an "OVERALL TOTALS" footer, N/C flags, and a billing
// code carrying a trailing letter (O-09-022A).
//
// The invariant this exists to protect: when the sheet carries no sub-code
// data it only asserts PROJECT totals, so the comparison must drop to project
// level. Comparing per sub-code would flag every row as mismatched purely
// because the tracker knows more than the spreadsheet does.
const { launch, step, done } = require('./_lib');

(async () => {
  const { browser, page } = await launch({
    wt_projects_meta: {
      overhead: { label: 'Overhead', color: '#4a7', billingCode: 'T-0', subCodes: [], tags: [] },
      cwc: {
        label: 'Clean Water Certificate', color: '#60a5fa', billingCode: 'T-21-010',
        subCodes: [{ id: 'sc1', code: '1', label: 'Instructor Prep' }, { id: 'sc2', code: '2', label: 'Data Audit' }],
        tags: []
      },
      leave: { label: 'Employee Leave', color: '#a78bfa', billingCode: 'O-09-022A', subCodes: [], tags: [] }
    },
    wt_project_order: ['overhead', 'cwc', 'leave'],
    wt_completed: [
      // One sheet line vs TWO tracker entries under different sub-codes on the
      // same day — the case that only reconciles at project granularity.
      { id: 'e1', name: 'Prep',      project: 'cwc', subCode: 'sc1', dateCompleted: '2026-08-03', estHours: 1.5, actualHours: 1.5 },
      { id: 'e2', name: 'Audit',     project: 'cwc', subCode: 'sc2', dateCompleted: '2026-08-03', estHours: 1,   actualHours: 1 },
      { id: 'e3', name: 'Dashboard', project: 'cwc', subCode: 'sc1', dateCompleted: '2026-08-04', estHours: 2,   actualHours: 2 }
    ]
  });

  // Exactly what SheetJS { cellDates:true, defval:null } hands over.
  const mkSheet = () => [
    ['Project', 'Staff Member', 'Category', 'Date', 'Input', 'N/C', 'Notes'],
    ['T-21-010 Clean Water Certificate', 'Kaitie Evers', '', new Date('2026-08-03T00:00:00'), 2.5, 'No',  'report review'],
    ['T-21-010 Clean Water Certificate', 'Kaitie Evers', '', new Date('2026-08-04T00:00:00'), 3,   'No',  'dashboard'],
    ['O-09-022A Employee Leave - Combined', 'Kaitie Evers', '', new Date('2026-08-05T00:00:00'), 8, 'Yes', 'PTO'],
    ['O-09-019 Supervision',            'Kaitie Evers', '', new Date('2026-08-05T00:00:00'), 0.5, 'Yes', 'check-in'],
    ['T-21-010 Clean Water Certificate', 'Dana Ruiz',    '', new Date('2026-08-06T00:00:00'), 5,   'No',  'not mine'],
    ['OVERALL TOTALS', null, null, null, 19, null, null]
  ];

  // ── 1. header detection against the real column names ──
  let r = await page.evaluate(sheet => _tsaDetectColumns(sheet[0]), mkSheet());
  step('"Project" → job, "Input" → hours, "Category" → task',
    r.job === 0 && r.hours === 4 && r.task === 2, r);
  step('"Staff Member" and "N/C" detected as filter columns',
    r.staff === 1 && r.nonCharge === 5, r);
  step('"Date" and "Notes" detected', r.date === 3 && r.notes === 6, r);

  // ── 2. parse: Date objects, totals footer, trailing-letter code ──
  r = await page.evaluate(sheet => {
    const plan = _buildTsAuditPlan(sheet, _tsaDetectColumns(sheet[0]), sheet[0]);
    _tsAuditPlan = plan;
    return {
      parsed: plan.rows.length,
      skipped: plan.skipped,
      bad: plan.badRows.length,
      dates: plan.rows.map(x => x.date),
      leaveCode: plan.rows.find(x => x.jobRaw.startsWith('O-09-022A'))?.billingCode,
      staffList: plan.staffList,
      staffFilter: plan.staffFilter,
      nc: { count: plan.ncCount, hours: plan.ncHours }
    };
  }, mkSheet());
  step('5 time rows parsed, none unreadable', r.parsed === 5 && r.bad === 0, { parsed: r.parsed, bad: r.bad });
  step('"OVERALL TOTALS" footer skipped silently, not reported as an error',
    r.skipped.totals === 1 && r.skipped.noDate === 0, r.skipped);
  step('Date cell objects convert without a timezone slip',
    r.dates[0] === '2026-08-03' && r.dates[4] === '2026-08-06', r.dates);
  step('billing code with a trailing letter parses (O-09-022A)', r.leaveCode === 'O-09-022A', r.leaveCode);
  step('N/C column read: 2 lines, 8.5h', r.nc.count === 2 && r.nc.hours === 8.5, r.nc);

  // ── 3. multi-staff export defaults to one person, never everyone ──
  step('both staff names collected, busiest first',
    r.staffList.length === 2 && r.staffList[0] === 'Kaitie Evers', r.staffList);
  step('staff filter defaults to the busiest — a colleague\'s hours never import silently',
    r.staffFilter === 'Kaitie Evers', r.staffFilter);

  // ── 4. empty Category → project-level comparison ──
  r = await page.evaluate(() => {
    const groups = _tsaComputeGroups(_tsAuditPlan);
    _tsAuditPlan.groupsCache = groups;
    const cwc = groups.find(g => g.projKey === 'cwc');
    const day = d => cwc.days.find(x => x.date === d);
    return {
      scLevel: _tsAuditPlan.scLevel,
      cwcKey: cwc.key,
      scLabel: cwc.scLabel,
      cwcSheet: cwc.sheetTotal, cwcTrk: cwc.trackerTotal,
      d0803: { status: day('2026-08-03').status, trk: day('2026-08-03').trackerHours, entries: day('2026-08-03').entries.length },
      d0804: { status: day('2026-08-04').status, delta: day('2026-08-04').delta, action: day('2026-08-04').action },
      danaLeaked: groups.some(g => g.days.some(d => d.date === '2026-08-06')),
      window: [_tsAuditPlan.dateFrom, _tsAuditPlan.dateTo],
      activeHours: _tsaActiveRows(_tsAuditPlan).reduce((a, x) => a + x.hours, 0)
    };
  });
  step('no sub-code data on the sheet → project-level comparison', r.scLevel === false, r.scLevel);
  step('group is the whole project, labelled as such',
    r.cwcKey === 'cwc|*' && r.scLabel === '(all sub-codes)', { key: r.cwcKey, label: r.scLabel });
  step('two tracker entries under DIFFERENT sub-codes roll into one day bucket',
    r.d0803.entries === 2 && r.d0803.trk === 2.5, r.d0803);
  step('…and that day reads in sync against the single sheet line',
    r.d0803.status === 'match', r.d0803.status);
  step('a genuine project-level shortfall is still caught (+1h)',
    r.d0804.status === 'under' && r.d0804.delta === 1 && r.d0804.action === 'apply', r.d0804);
  step('the other staff member\'s day never enters the comparison', r.danaLeaked === false, r.danaLeaked);
  step('window follows the filtered rows, not the raw sheet',
    r.window[0] === '2026-08-03' && r.window[1] === '2026-08-05', r.window);
  step('filtered sheet total is this person\'s 14h', r.activeHours === 14, r.activeHours);

  // ── 5. switching to "everyone" reconciles with the sheet's own totals row ──
  r = await page.evaluate(() => {
    _tsaSetStaff(-1);
    return _tsaActiveRows(_tsAuditPlan).reduce((a, x) => a + x.hours, 0);
  });
  step('all-staff total matches the sheet\'s own OVERALL TOTALS (19h)', r === 19, r);

  // ── 6. non-chargeable toggle ──
  r = await page.evaluate(() => {
    _tsaSetStaff(0);                       // back to Kaitie
    _tsaSetIncludeNc(false);
    const groups = _tsaComputeGroups(_tsAuditPlan);
    return {
      hours: _tsaActiveRows(_tsAuditPlan).reduce((a, x) => a + x.hours, 0),
      window: [_tsAuditPlan.dateFrom, _tsAuditPlan.dateTo],
      leaveGone: !groups.some(g => g.billingCode === 'O-09-022A'),
      backOn: (() => { _tsaSetIncludeNc(true); return _tsaActiveRows(_tsAuditPlan).reduce((a, x) => a + x.hours, 0); })()
    };
  });
  step('excluding N/C drops leave and supervision (14h → 5.5h)', r.hours === 5.5, r.hours);
  step('window contracts to the remaining days', r.window[1] === '2026-08-04', r.window);
  step('the leave code leaves the comparison entirely', r.leaveGone, r.leaveGone);
  step('re-including restores the full 14h', r.backOn === 14, r.backOn);

  // ── 7. commit at project level lands on the project with no sub-code ──
  r = await page.evaluate(() => {
    _tsAuditPlan.groupsCache = _tsaComputeGroups(_tsAuditPlan);
    _commitTsAuditPlan();
    const added = completed.filter(e => e._tsaRef);
    return {
      count: added.length,
      entry: added.map(e => ({ p: e.project, sc: e.subCode, d: e.dateCompleted, h: e.actualHours })),
      d0804: completed.filter(e => e.dateCompleted === '2026-08-04').reduce((a, e) => a + e.actualHours, 0)
    };
  });
  step('project-level fix tops up the shortfall only', r.d0804 === 3, r.d0804);
  step('added entries carry the project and an empty sub-code',
    r.entry.every(e => e.p && e.sc === ''), r.entry);

  await done(browser);
})();
