// Delegation (Assign-to) invariants: tagging a task to someone else moves it
// off My Tasks (it renders on Team Deliverables); co-assigning with Me keeps
// it on My Tasks BY DESIGN; the assign dropdown never leaks its task target
// into a later session/subtask dropdown; the Projects-tab row updates live.
const { launch, step, done } = require('./_lib');

(async () => {
  const { browser, page } = await launch({
    wt_active_tab: 'projects',
    wt_persons: ['Jordan K'],
    wt_projects_meta: { overhead: { label: 'Overhead', color: '#4a7', billingCode: 'T-0', subCodes: [], tags: [] } },
    wt_tasks: [
      { id: '_t1', name: 'TaskAlpha', project: 'overhead', subCode: '', priority: 'med', due: '2027-01-20', est: 2, timer: 0, timerStart: null, completed: false }
    ],
    wt_bigprojs: [{ id: '_bp1', name: 'Rollout', project: 'overhead', sessions: [{ id: '_s1', desc: 'SessionGamma', date: '2027-01-22', hours: 3, done: false, subCode: '', priority: 'med', timer: 0, timerStart: null, subtasks: [] }] }]
  });
  // 1. Assign the task to a teammate via the Projects-tab ↗ flow.
  let r = await page.evaluate(() => {
    showTaskAssignDropdown({ stopPropagation() {}, currentTarget: document.body }, '_t1');
    toggleTaskPersonAssignment('Jordan K');
    const tagSpan = document.getElementById('task-tags-_t1');
    return {
      del: JSON.stringify(tasks.find(t => t.id === '_t1').delegatedTo),
      rowTagLive: !!tagSpan && tagSpan.innerHTML.includes('Jordan'),
      inMyTasks: document.getElementById('panel-tasks').innerHTML.includes('TaskAlpha'),
      onTeam: (renderTeam(), document.getElementById('panel-team').innerHTML.includes('TaskAlpha')),
      planned: plannedItems('2027-01-01', '2027-01-31').some(p => p.name === 'TaskAlpha')
    };
  });
  step('task → teammate: delegatedTo set', r.del === '["Jordan K"]', r.del);
  step('Projects row pill updates live (no re-render needed)', r.rowTagLive, r.rowTagLive);
  step('task leaves My Tasks', !r.inMyTasks, r.inMyTasks);
  step('task appears on Team Deliverables', r.onTeam, r.onTeam);
  step('task leaves Capacity (plannedItems)', !r.planned, r.planned);

  // 2. Dropdown hygiene: opening the SESSION dropdown right after must target
  //    the session — a stale _assignTaskId used to retarget the old task.
  r = await page.evaluate(() => {
    showAssignDropdown({ stopPropagation() {}, currentTarget: document.body }, '_bp1', '_s1');
    const menu = document.getElementById('assignDropdown').innerHTML;
    const targetsSession = menu.includes("togglePersonAssignment(") && !menu.includes('toggleTaskPersonAssignment');
    togglePersonAssignment('Jordan K');
    return {
      targetsSession,
      sessionDel: JSON.stringify(bigProjs[0].sessions[0].delegatedTo),
      taskDelUntouched: JSON.stringify(tasks.find(t => t.id === '_t1').delegatedTo)
    };
  });
  step('session dropdown targets the session, not the stale task', r.targetsSession, r.targetsSession);
  step('session gets the assignment; earlier task assignment untouched',
    r.sessionDel === '["Jordan K"]' && r.taskDelUntouched === '["Jordan K"]', r);

  // 3. Co-assigning Me keeps the task on My Tasks — deliberate design.
  r = await page.evaluate(() => {
    showTaskAssignDropdown({ stopPropagation() {}, currentTarget: document.body }, '_t1');
    toggleTaskPersonAssignment('Me');
    return {
      del: JSON.stringify(tasks.find(t => t.id === '_t1').delegatedTo),
      inMyTasks: document.getElementById('panel-tasks').innerHTML.includes('TaskAlpha'),
      planned: plannedItems('2027-01-01', '2027-01-31').some(p => p.name === 'TaskAlpha')
    };
  });
  step('Me + teammate = co-assigned: stays on My Tasks and in Capacity',
    r.del === '["Jordan K","Me"]' && r.inMyTasks && r.planned, r);

  // 4. Toggling the person off returns the task fully to Me.
  r = await page.evaluate(() => {
    toggleTaskPersonAssignment('Me');
    toggleTaskPersonAssignment('Jordan K');
    return {
      del: JSON.stringify(tasks.find(t => t.id === '_t1').delegatedTo || null),
      inMyTasks: document.getElementById('panel-tasks').innerHTML.includes('TaskAlpha')
    };
  });
  step('clearing the assignment brings the task back to My Tasks', r.del === 'null' && r.inMyTasks, r);

  await done(browser);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
