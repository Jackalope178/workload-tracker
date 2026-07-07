// Sync safety: save() stamps per-key timestamps (what the cloud merge keys
// off), and _syncGuardUser only lets local data shadow the cloud when it
// belongs to the signing-in account — an account switch stashes a snapshot
// and drops the stamps so the cloud wins. (Network paths aren't drivable
// headless; this covers the pure logic those paths rely on.)
const { launch, step, done } = require('./_lib');

(async () => {
  const { browser, page } = await launch({
    wt_last_user: 'user-A',
    wt_tasks: [{ id: '_t1', name: 'Someone else\'s task', project: 'overhead', subCode: '', priority: 'med', due: '', est: 1, completed: false, timer: 0, timerStart: null }]
  });

  // 1. save() stamps the per-key timestamp the merge relies on
  let r = await page.evaluate(() => {
    localStorage.removeItem('_ts_wt_tasks');
    save('wt_tasks', tasks);
    return { ts: parseInt(localStorage.getItem('_ts_wt_tasks') || '0', 10) };
  });
  step('save() stamps _ts_<key> (the merge’s freshness signal)', r.ts > 0, r.ts);

  // 2. Account SWITCH: stamps dropped (cloud will win), snapshot stashed, user recorded
  r = await page.evaluate(() => {
    _currentUser = { id: 'user-B' };
    _syncGuardUser();
    const snap = JSON.parse(localStorage.getItem('wt_local_snapshot') || 'null');
    return {
      tsCleared: localStorage.getItem('_ts_wt_tasks') === null,
      snapUser: snap && snap.user,
      snapHasTasks: !!(snap && snap.data && snap.data.wt_tasks),
      lastUser: localStorage.getItem('wt_last_user'),
      toast: document.getElementById('syncToastMsg')?.textContent || ''
    };
  });
  step('account switch drops _ts_ stamps so cloud wins', r.tsCleared);
  step('previous account’s data stashed in wt_local_snapshot', r.snapUser === 'user-A' && r.snapHasTasks, { user: r.snapUser });
  step('wt_last_user updated + user informed', r.lastUser === 'user-B' && /different account/i.test(r.toast), r.toast);

  // 3. SAME user signing in again: stamps untouched (offline edits stay defended)
  r = await page.evaluate(() => {
    save('wt_tasks', tasks);   // re-stamp
    const before = localStorage.getItem('_ts_wt_tasks');
    _syncGuardUser();          // _currentUser still user-B
    return { same: localStorage.getItem('_ts_wt_tasks') === before };
  });
  step('same-user sign-in leaves timestamps intact (offline work defended)', r.same);

  // 4. First-ever sign-in on a device (no recorded user): keep merge semantics
  r = await page.evaluate(() => {
    localStorage.removeItem('wt_last_user');
    const before = localStorage.getItem('_ts_wt_tasks');
    _currentUser = { id: 'user-C' };
    _syncGuardUser();
    return { same: localStorage.getItem('_ts_wt_tasks') === before, lastUser: localStorage.getItem('wt_last_user') };
  });
  step('first sign-in on a device keeps stamps (legit bring-my-data path)', r.same && r.lastUser === 'user-C', r.lastUser);

  // 5. wt_last_user / wt_local_snapshot / _ts_ must stay OUT of SYNC_KEYS
  r = await page.evaluate(() => SYNC_KEYS.filter(k => k === 'wt_last_user' || k === 'wt_local_snapshot' || k.startsWith('_ts_')));
  step('device-local sync bookkeeping is never itself synced', r.length === 0, r);

  await done(browser);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
