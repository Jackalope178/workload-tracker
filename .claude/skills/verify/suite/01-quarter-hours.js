// Math invariant #4: billing is quarter-hours. roundToQuarter has a 0.25
// FLOOR (never for possibly-zero quantities); snapQuarter is the zero-safe
// nearest-quarter; enforceQuarter guards every saved hours value.
const { launch, step, done } = require('./_lib');

(async () => {
  const { browser, page } = await launch({});
  const r = await page.evaluate(() => ({
    floorTiny: roundToQuarter(0.1),      // 0.25 floor
    floorZero: roundToQuarter(0),        // still 0.25 — that's WHY it must not see zeros
    fiveMinGrace: roundToQuarter(1.33),  // ≤5min over a quarter rounds DOWN
    roundUp: roundToQuarter(1.4),        // >5min over rounds UP
    snapZero: snapQuarter(0),            // zero-safe
    snapTiny: snapQuarter(0.1),          // nearest = 0
    snapMid: snapQuarter(1.13),          // nearest = 1.25
    enforce: enforceQuarter(1.3, 'test'),// nearest quarter
    enforceNull: enforceQuarter(null, 'test'),
    enforceNeg: enforceQuarter(-1.3, 'test') // negatives clamp to 0 — hours never subtract
  }));
  step('roundToQuarter(0.1) floors to 0.25', r.floorTiny === 0.25, r.floorTiny);
  step('roundToQuarter(0) returns 0.25 (the trap the floor rule guards)', r.floorZero === 0.25, r.floorZero);
  step('roundToQuarter(1.33) rounds down within 5-min grace', r.fiveMinGrace === 1.25, r.fiveMinGrace);
  step('roundToQuarter(1.4) rounds up past grace', r.roundUp === 1.5, r.roundUp);
  step('snapQuarter(0) === 0 (zero-safe, unlike roundToQuarter)', r.snapZero === 0, r.snapZero);
  step('snapQuarter(0.1) === 0', r.snapTiny === 0, r.snapTiny);
  step('snapQuarter(1.13) === 1.25', r.snapMid === 1.25, r.snapMid);
  step('enforceQuarter(1.3) === 1.25', r.enforce === 1.25, r.enforce);
  step('enforceQuarter(null) passes null through', r.enforceNull === null, r.enforceNull);
  step('enforceQuarter(-1.3) clamps to 0 (negative hours never store)', r.enforceNeg === 0, r.enforceNeg);
  await done(browser);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
