// Fresh-browser sign-in must never overwrite the cloud (Nov 2026 data-loss
// fix). Script load seeds empty defaults (wt_tasks = [], DEFAULT_PROJECTS, …)
// before anyone signs in; if those writes were stamped "now", the empty seed
// looked newer than the real cloud data, loadFromSupabase kept it, and the
// post-load flush pushed [] over the cloud. Boot-phase saves (_bootSeeding)
// now leave _ts_ stamps alone, so the cloud wins on a new device — while real
// edits made once the app is usable are still stamped and still defended.
// The Supabase client is faked in-page (network paths aren't drivable here).
const { launch, step, done } = require('./_lib');

(async () => {
  const { browser, page } = await launch({});   // brand-new browser: nothing but wt_onboarded

  // 1. Boot seeded the data keys but stamped none of them
  let r = await page.evaluate(() => ({
    seeded: ['wt_tasks', 'wt_completed', 'wt_projects_meta'].every(k => localStorage.getItem(k) !== null),
    stamped: SYNC_KEYS.filter(k => localStorage.getItem('_ts_' + k) !== null),
    bootFlagCleared: _bootSeeding === false
  }));
  step('boot seeds defaults without stamping them as edits', r.seeded && r.stamped.length === 0, r.stamped);
  step('_bootSeeding is cleared once the app is up', r.bootFlagCleared);

  // Fake Supabase: holds "yesterday's" real data, records every upsert
  const install = () => page.evaluate(() => {
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    window.__cloud = {
      wt_tasks: [{ id: '_real1', name: 'Real cloud task', project: 'cwc', subCode: '', priority: 'med', due: '', est: 2, completed: false }],
      wt_completed: [{ id: '_c1', name: 'Logged', project: 'cwc', subCode: '', dateCompleted: '2026-11-20', estHours: 3, actualHours: 3, category: '' }],
      wt_projects_meta: { cwc: { label: 'CWC (cloud)', color: '#22c55e', billingCode: 'T-21-010', subCodes: [], tags: [] } }
    };
    window.__upserts = [];
    _supabase = {
      from() {
        const q = {
          select() { return q; }, eq() { return q; },
          then(res) {
            const rows = Object.entries(window.__cloud).map(([key, value]) => ({ key, data: { value }, updated_at: yesterday }));
            return Promise.resolve({ data: rows, error: null }).then(res);
          },
          upsert(row) { window.__upserts.push({ key: row.key, value: row.data.value }); return Promise.resolve({ error: null }); }
        };
        return q;
      }
    };
  });

  // 2. First sign-in on this browser: cloud wins, nothing empty is pushed over it
  await install();
  r = await page.evaluate(async () => {
    _currentUser = { id: 'user-1' };
    await loadFromSupabase();
    await new Promise(res => setTimeout(res, 300));
    const pushedEmpty = window.__upserts.filter(u => Array.isArray(u.value) ? u.value.length === 0 && (window.__cloud[u.key] || []).length > 0 : false);
    const pushedTasks = window.__upserts.filter(u => u.key === 'wt_tasks');
    return {
      localTasks: JSON.parse(localStorage.getItem('wt_tasks')).map(t => t.name),
      localMeta: JSON.parse(localStorage.getItem('wt_projects_meta')).cwc.label,
      pushedEmpty: pushedEmpty.map(u => u.key),
      tasksPushOk: pushedTasks.every(u => u.value.length === 1 && u.value[0].id === '_real1')
    };
  });
  step('new-browser sign-in loads the cloud tasks (not the empty seed)', r.localTasks.length === 1 && r.localTasks[0] === 'Real cloud task', r.localTasks);
  step('cloud project metadata beats the seeded defaults', r.localMeta === 'CWC (cloud)', r.localMeta);
  step('no empty seed value is pushed over non-empty cloud data', r.pushedEmpty.length === 0 && r.tasksPushOk, r.pushedEmpty);

  // 3. A real edit (app is usable) is still stamped and still beats older cloud data
  await install();
  r = await page.evaluate(async () => {
    _currentUser = null;
    tasks = [{ id: '_off1', name: 'Offline edit', project: 'cwc', subCode: '', priority: 'med', due: '', est: 1, completed: false }];
    save('wt_tasks', tasks);
    const stamped = parseInt(localStorage.getItem('_ts_wt_tasks') || '0', 10) > 0;
    _currentUser = { id: 'user-1' };
    await loadFromSupabase();
    await new Promise(res => setTimeout(res, 300));
    return {
      stamped,
      localTasks: JSON.parse(localStorage.getItem('wt_tasks')).map(t => t.name),
      pushed: window.__upserts.filter(u => u.key === 'wt_tasks').map(u => u.value.map(t => t.name))
    };
  });
  step('a post-boot edit is stamped', r.stamped);
  step('newer local edit survives sign-in and is pushed up', r.localTasks[0] === 'Offline edit' && r.pushed.some(v => v[0] === 'Offline edit'), r);

  await done(browser);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
