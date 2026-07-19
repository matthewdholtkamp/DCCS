const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Outlook = require('../js/app-decision-outlook.js');

const DAY_MS = Outlook.DAY_MS;

function datedValues(values, start = '2026-04-01', dayStep = 7) {
  let stamp = Date.parse(`${start}T00:00:00Z`);
  return values.map(value => {
    const row = { date: new Date(stamp).toISOString().slice(0, 10), value, coverage: 1 };
    stamp += dayStep * DAY_MS;
    return row;
  });
}

function weeklySpec(overrides = {}) {
  return {
    id: 'test-access',
    metricId: 'test-access',
    serviceLineId: 'pcsl',
    service: 'PCSL',
    name: 'Test access',
    cadence: 'week',
    unit: 'hours',
    decimals: 1,
    target: 20,
    direction: 'lower',
    inclusive: false,
    action: 'Use the configured response.',
    supportIds: [],
    ...overrides
  };
}

test('daily series normalize into non-overlapping seven-day windows', () => {
  const daily = datedValues(Array.from({ length: 14 }, (_, index) => index + 1), '2026-05-01', 1);
  const buckets = Outlook.weeklyBuckets(daily, rows => rows.reduce((sum, row) => sum + row.value, 0) / rows.length);
  assert.equal(buckets.length, 2);
  assert.deepEqual(buckets.map(bucket => bucket.value), [4, 11]);
  assert.deepEqual(buckets.map(bucket => bucket.coverage), [1, 1]);
});

test('LWOBS ratio is calculated from matched daily counts', () => {
  const census = datedValues([100, 100, 100, 100, 100, 100, 100], '2026-05-01', 1);
  const lwobs = datedValues([1, 0, 2, 0, 1, 0, 3], '2026-05-01', 1);
  const buckets = Outlook.weeklyRatioBuckets(lwobs, census);
  assert.equal(buckets.length, 1);
  assert.equal(buckets[0].value, 1);
});

test('forecasts require eight weekly-equivalent observations', () => {
  const points = datedValues([20, 20, 20, 20, 20, 20, 20]);
  const result = Outlook.forecastSeries(points, weeklySpec(), { asOf: points.at(-1).date });
  assert.equal(result.state, 'insufficient');
  assert.match(result.limitation, /Need 8 weekly-equivalent observations/);
});

test('monthly forecasts require six observations', () => {
  const points = ['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01']
    .map(date => ({ date, value: 4, coverage: 1 }));
  const result = Outlook.forecastSeries(points, weeklySpec({ cadence: 'month' }), { asOf: '2026-05-01' });
  assert.equal(result.state, 'insufficient');
  assert.match(result.limitation, /Need 6 monthly observations/);
});

test('stale histories are not extrapolated', () => {
  const points = datedValues(Array(8).fill(18));
  const result = Outlook.forecastSeries(points, weeklySpec(), { asOf: '2026-08-01' });
  assert.equal(result.state, 'insufficient');
  assert.match(result.limitation, /more than two weeks old/);
});

test('target classification uses the conservative 80% range', () => {
  const onTrackPoints = datedValues(Array(8).fill(18));
  const onTrack = Outlook.forecastSeries(onTrackPoints, weeklySpec(), { asOf: onTrackPoints.at(-1).date });
  assert.equal(onTrack.state, 'on-track');

  const riskPoints = datedValues([18, 21, 18, 21, 18, 21, 18, 19]);
  const atRisk = Outlook.forecastSeries(riskPoints, weeklySpec(), { asOf: riskPoints.at(-1).date });
  assert.equal(atRisk.state, 'at-risk');
  assert.ok(atRisk.forecast.at(-1).value < 20);
  assert.ok(atRisk.forecast.at(-1).upper >= 20);

  const offTrackPoints = datedValues(Array(8).fill(22));
  const offTrack = Outlook.forecastSeries(offTrackPoints, weeklySpec(), { asOf: offTrackPoints.at(-1).date });
  assert.equal(offTrack.state, 'off-track');
});

test('forecast snapshot preserves the complete decision evidence contract', () => {
  const points = datedValues(Array(8).fill(18));
  const outcome = Outlook.forecastSeries(points, weeklySpec({ milestone: '2026-08-10' }), { asOf: points.at(-1).date });
  const snapshot = Outlook.outlookSnapshot(outcome);
  assert.equal(snapshot.metricId, 'test-access');
  assert.deepEqual(snapshot.sourceMetricIds, ['test-access']);
  assert.deepEqual(snapshot.sourceDates, { start: points[0].date, end: points.at(-1).date });
  assert.equal(snapshot.currentValue, 18);
  assert.equal(snapshot.target, 20);
  assert.equal(snapshot.targetDate, '2026-08-10');
  assert.equal(snapshot.forecastPoints.length, 12);
  assert.deepEqual(Object.keys(snapshot.forecastPoints[0].predictionRange).sort(), ['lower', 'upper']);
  assert.equal(snapshot.outlookState, 'on-track');
  assert.equal(snapshot.freshness.cadence, 'week');
});

test('virtual utilization remains an explicit unsupported forecast', () => {
  const emptyApp = { getMetricEntries: () => [], getDialogueEntries: () => [] };
  const result = Outlook.buildOutlook(emptyApp, { asOf: '2026-07-19' });
  assert.match(result.limitations[0], /15% utilization forecast requires total appointments/);
  assert.equal(result.outcomes.every(outcome => outcome.state === 'insufficient'), true);
});

test('derived LWOBS outlook records both raw source metric IDs', () => {
  const spec = Outlook.OUTCOME_SPECS.find(item => item.id === 'er-lwobs-rate');
  const points = datedValues(Array(8).fill(0.5));
  const outcome = Outlook.forecastSeries(points, spec, { asOf: points.at(-1).date });
  assert.deepEqual(outcome.sourceMetricIds, ['er-lwobs', 'er-total-census']);
  assert.deepEqual(Outlook.outlookSnapshot(outcome).sourceMetricIds, ['er-lwobs', 'er-total-census']);
});

test('decision persistence is isolated to the additive Firestore path', () => {
  assert.equal(Outlook.DECISION_PATH, 'dccs_data/decisions/entries');
  const source = fs.readFileSync(path.join(__dirname, '../js/app-decision-outlook.js'), 'utf8');
  assert.doesNotMatch(source, /saveMetricSeries|saveDialogueEntries|updateTaskStatus|updateTaskKpi/);
});
