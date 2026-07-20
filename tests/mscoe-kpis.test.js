const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Kpis = require('../js/mscoe-kpis.js');

function daily(values, start = '2026-07-01') {
  let stamp = Date.parse(`${start}T00:00:00Z`);
  return values.map(value => {
    const entry = { date: new Date(stamp).toISOString().slice(0, 10), value };
    stamp += Kpis.DAY_MS;
    return entry;
  });
}

test('trainee share boundaries are green below 20, amber through 25, and red above 25', () => {
  assert.equal(Kpis.classify('traineeCensusShare', 19.9), 'green');
  assert.equal(Kpis.classify('traineeCensusShare', 20), 'amber');
  assert.equal(Kpis.classify('traineeCensusShare', 25), 'amber');
  assert.equal(Kpis.classify('traineeCensusShare', 25.1), 'red');
});

test('Cat 4/5 share boundaries are green through 33, amber through 40, and red above 40', () => {
  assert.equal(Kpis.classify('lowAcuityShare', 33), 'green');
  assert.equal(Kpis.classify('lowAcuityShare', 33.1), 'amber');
  assert.equal(Kpis.classify('lowAcuityShare', 40), 'amber');
  assert.equal(Kpis.classify('lowAcuityShare', 40.1), 'red');
});

test('ratios use matched-period totals and do not treat missing numerator days as zero', () => {
  const numerator = daily([20, 30]);
  const denominator = daily([100, 100, 100]);
  const ratio = Kpis.ratioForRange(numerator, denominator, '2026-07-01', '2026-07-03');
  assert.equal(ratio.value, 25);
  assert.equal(ratio.matchedDays, 2);
  assert.equal(ratio.numeratorTotal, 50);
  assert.equal(ratio.denominatorTotal, 200);
});

test('missing or zero denominators are insufficient data, never green', () => {
  const store = {
    'er-total-trainees': daily([10, 10]),
    'er-total-census': daily([0, 0])
  };
  const snapshot = Kpis.buildSnapshot(store, 'traineeCensusShare');
  assert.equal(snapshot.currentValue, null);
  assert.equal(snapshot.status, 'grey');
  assert.equal(snapshot.statusLabel, 'Insufficient data');
});

test('seven-day snapshot compares the newest matched window with the preceding window', () => {
  const store = {
    'er-total-census': daily(Array(14).fill(100)),
    'er-total-trainees': daily([...Array(7).fill(10), ...Array(7).fill(20)]),
    'er-esi-4-5': daily([...Array(7).fill(3), ...Array(7).fill(8)])
  };
  const trainee = Kpis.buildSnapshot(store, 'traineeCensusShare');
  const lowAcuity = Kpis.buildSnapshot(store, 'lowAcuityShare');
  assert.equal(trainee.currentValue, 20);
  assert.equal(trainee.previousValue, 10);
  assert.equal(trainee.status, 'amber');
  assert.equal(lowAcuity.currentValue, 40);
  assert.equal(lowAcuity.previousValue, 30);
  assert.equal(lowAcuity.status, 'amber');
});

test('AI and SITREP payloads expose the derived values, formulas, thresholds, and report-only policy', () => {
  const store = {
    'er-total-census': daily(Array(14).fill(100)),
    'er-total-trainees': daily(Array(14).fill(20)),
    'er-esi-4-5': daily(Array(14).fill(8))
  };
  const context = Kpis.buildContext(store);
  assert.equal(context.reportingOnly, true);
  assert.deepEqual(context.metrics[0].sourceMetricIds, ['er-total-trainees', 'er-total-census']);
  assert.equal(context.metrics[0].currentSevenDayValue, 20);
  assert.equal(context.metrics[0].status, 'amber');
  assert.match(context.metrics[0].thresholds, /Amber 20–25%/);

  const sitrep = Kpis.buildSitrepMetrics(store, {
    startISO: '2026-07-08', endISO: '2026-07-14',
    priorStartISO: '2026-07-01', priorEndISO: '2026-07-07'
  });
  assert.equal(sitrep.length, 2);
  assert.equal(sitrep[1].headline, 40);
  assert.equal(sitrep[1].statusBand, 'Amber');
  assert.equal(sitrep[1].deltaText, '+0.0 percentage points');
});

test('derived KPI module and its consumers contain no metric or Firestore writes', () => {
  const files = [
    '../js/mscoe-kpis.js',
    '../js/app-dashboard.js',
    '../js/app-er-charts.js',
    '../js/ask-dr-holtkamp-sitrep.js'
  ];
  const source = files.map(file => fs.readFileSync(path.join(__dirname, file), 'utf8')).join('\n');
  assert.doesNotMatch(source, /saveMetricSeries|updateTaskStatus|updateTaskKpi/);
  const moduleSource = fs.readFileSync(path.join(__dirname, '../js/mscoe-kpis.js'), 'utf8');
  assert.doesNotMatch(moduleSource, /Firestore|firebase|\.collection\s*\(|saveMetricSeries|saveDialogueEntries/);
});
