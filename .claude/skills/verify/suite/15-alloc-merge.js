// Allocation import ↔ manually added projects: a bare-code Job cell still
// code-matches, every existing project is offered as a merge target, and an
// unmatched row SUGGESTS a similar existing project with a one-click merge
// (so imports never silently duplicate a manually added project).
const { launch, step, done } = require('./_lib');

(async () => {
  const { browser, page } = await launch({
    wt_projects_meta: {
      overhead: { label: 'Overhead', color: '#4a7', billingCode: 'T-0', subCodes: [], tags: [] },
      newlibra: { label: 'New Library Program', color: '#60a5fa', billingCode: 'T-26-051', subCodes: [], tags: [] }
    },
    wt_xlsx_alloc_imported: '1'
  });

  // 1. Bare-code Job cell parses its code (used to fall through to label-only).
  let r = await page.evaluate(() => ({
    bare: _parseBillingCode('T-26-051'),
    labeled: _parseBillingCode('T-26-051 New Library Program'),
    plain: _parseBillingCode('Just words')
  }));
  step('bare "T-26-051" parses as a code', r.bare.code === 'T-26-051' && r.bare.label === '', r.bare);
  step('code+label still parses', r.labeled.code === 'T-26-051' && r.labeled.label === 'New Library Program', r.labeled);
  step('non-code strings stay label-only', r.plain.code === '' && r.plain.label === 'Just words', r.plain);

  // 2. Build a plan: bare-code row auto-matches the manual project; a
  //    reworded row doesn't match but gets a merge suggestion.
  r = await page.evaluate(() => {
    const rows = [
      ['Job', 'Task', 'JUL 2027', 'AUG 2027'],
      ['T-26-051', 'Planning', 10, 5],                        // bare code → match manual project
      ['B-77-777 Library Grant Program', 'Kickoff', 4, null]  // reworded → suggest manual project
    ];
    const plan = _buildAllocImportPlan(rows, 0, 1, { 2: '2027-07', 3: '2027-08' });
    _allocImportPlan = plan;
    _showAllocImportPreview();
    const modal = document.getElementById('allocImportPreviewModal');
    const html = modal.innerHTML;
    return {
      row0Match: plan.rows[0].projKey,
      row1New: plan.rows[1].projIsNew,
      dropdownHasManual: html.includes('New Library Program (T-26-051)'),
      suggestion: html.includes('A similar project already exists') && html.includes('Merge into it')
    };
  });
  step('bare-code row auto-matches the manually added project', r.row0Match === 'newlibra', r.row0Match);
  step('reworded row is unmatched (would create new)', r.row1New, r.row1New);
  step('merge dropdown lists the manual project', r.dropdownHasManual, r.dropdownHasManual);
  step('unmatched row shows a similar-project suggestion with one-click merge', r.suggestion, r.suggestion);

  // 3. Clicking the suggestion merges the row into the manual project.
  r = await page.evaluate(() => {
    const idx = _allocImportPlan.rows.findIndex(x => x.projIsNew);
    _aipSetRowProj(idx, 'newlibra');
    const resolved = _aipResolveProject(_allocImportPlan.rows[idx]);
    return { projKey: resolved.projKey, isNew: resolved.isNew };
  });
  step('suggestion click resolves the row into the manual project', r.projKey === 'newlibra' && !r.isNew, r);

  await done(browser);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
