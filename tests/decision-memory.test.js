const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Memory = require('../js/ask-dr-holtkamp-decisions.js');

function decision(overrides = {}) {
  return {
    id: 'decision-1',
    createdAtISO: '2026-07-19T12:00:00.000Z',
    serviceLineId: 'pcsl',
    service: 'PCSL',
    outcomeId: 'pcsl-acute',
    outcomeName: 'Acute access',
    metricIds: ['pcsl-acute', 'pcsl-medic'],
    selectedCourse: 'recommended',
    selectedCourseLabel: 'Recommended action',
    action: 'Use the configured Care Ladder response.',
    rationale: 'Access is projected to miss the target.',
    owner: 'PCSL lead',
    reviewDate: '2026-08-01',
    status: 'open',
    outcome: '',
    forecastSnapshot: {
      outlookId: 'pcsl-acute',
      sourceMetricIds: ['pcsl-acute', 'pcsl-medic'],
      sourceDates: { start: '2026-05-01', end: '2026-07-18' },
      currentValue: 30,
      target: 24,
      targetDate: '2026-08-10',
      outlookState: 'off-track',
      confidence: 'high',
      decisionEligible: true,
      horizon: { date: '2026-10-10', value: 28, lower: 25, upper: 31 },
      forecastPoints: Array.from({ length: 12 }, (_, index) => ({ index, value: 28 }))
    },
    ...overrides
  };
}

test('preparation removes superseded and trainee records and collapses near-duplicates', () => {
  const records = [
    decision(),
    decision({
      id: 'decision-duplicate',
      createdAtISO: '2026-07-19T12:02:00.000Z',
      status: 'reviewed',
      outcome: 'Acute access improved after the capacity adjustment.'
    }),
    decision({ id: 'decision-superseded', status: 'superseded', rationale: 'Old course.' }),
    decision({
      id: 'decision-trainee',
      serviceLineId: 'mscoe',
      service: 'MSCoE / ER',
      outcomeId: 'er-trainees-average',
      outcomeName: 'Trainees in ER',
      rationale: 'Report-only item.'
    }),
    decision({
      id: 'decision-surgery',
      createdAtISO: '2026-07-18T12:00:00.000Z',
      serviceLineId: 'surgery',
      service: 'Surgery',
      outcomeId: 'surgery-total',
      outcomeName: 'Total surgeries',
      action: 'Review the surgical throughput constraint.',
      rationale: 'Volume is below the configured target.'
    })
  ];

  const prepared = Memory.prepareDecisionRecords(records);
  assert.equal(prepared.records.length, 2);
  assert.equal(prepared.duplicateCount, 1);
  assert.equal(prepared.excludedCount, 2);
  assert.equal(prepared.records.some(record => record.id === 'decision-duplicate'), true);
  assert.equal(prepared.records.some(record => record.serviceLineId === 'mscoe'), false);
});

test('identical decisions outside the duplicate window remain distinct history', () => {
  const prepared = Memory.prepareDecisionRecords([
    decision(),
    decision({ id: 'later-cycle', createdAtISO: '2026-07-20T12:00:00.000Z' })
  ]);
  assert.equal(prepared.records.length, 2);
  assert.equal(prepared.duplicateCount, 0);
});

test('question relevance outranks unrelated recency', () => {
  const records = Memory.prepareDecisionRecords([
    decision({
      id: 'new-surgery',
      createdAtISO: '2026-07-19T18:00:00.000Z',
      serviceLineId: 'surgery',
      service: 'Surgery',
      outcomeId: 'surgery-total',
      outcomeName: 'Total surgeries',
      rationale: 'Surgical volume requires attention.'
    }),
    decision({ id: 'older-pcsl', createdAtISO: '2026-07-10T12:00:00.000Z' })
  ]).records;

  const selected = Memory.selectDecisionRecords(records, 'What should we do about PCSL acute access?', null, 2);
  assert.equal(selected[0].id, 'older-pcsl');
});

test('documented outcomes receive priority for broad lessons-learned questions', () => {
  const records = Memory.prepareDecisionRecords([
    decision({ id: 'open-new', createdAtISO: '2026-07-19T18:00:00.000Z' }),
    decision({
      id: 'closed-result',
      createdAtISO: '2026-06-01T12:00:00.000Z',
      status: 'closed',
      outcome: 'Follow-up access returned within target before review.'
    })
  ]).records;

  const selected = Memory.selectDecisionRecords(records, 'What have we learned from prior actions?', null, 2);
  assert.equal(selected[0].id, 'closed-result');
});

test('AI context is bounded and omits full forecast point arrays', () => {
  const oversized = 'x'.repeat(3000);
  const records = Array.from({ length: 30 }, (_, index) => decision({
    id: `decision-${index}`,
    createdAtISO: new Date(Date.parse('2026-07-19T12:00:00.000Z') - index * 86400000).toISOString(),
    outcomeId: `pcsl-outcome-${index}`,
    outcomeName: `PCSL outcome ${index}`,
    action: oversized,
    rationale: oversized,
    outcome: oversized,
    status: 'closed'
  }));

  const knowledge = Memory.buildDecisionKnowledge(records, 'Review PCSL decisions', 'pcsl', 'ready');
  const serialized = JSON.stringify(knowledge);
  assert.ok(knowledge.recordsSelected <= Memory.CONTEXT_LIMIT);
  assert.ok(serialized.length <= Memory.CONTEXT_BYTE_LIMIT);
  assert.doesNotMatch(serialized, /forecastPoints/);
  assert.match(serialized, /forecastAtDecision/);
});

test('decision knowledge is inserted inside the existing DCCS context', () => {
  const base = 'DCCS_CONTEXT\n' + JSON.stringify({ framework: { title: 'DCCS' }, serviceLines: [] });
  const knowledge = { availability: 'ready', records: [{ id: 'decision-1' }] };
  const combined = Memory.appendDecisionKnowledge(base, knowledge);
  const parsed = JSON.parse(combined.slice('DCCS_CONTEXT\n'.length));
  assert.equal(parsed.framework.title, 'DCCS');
  assert.deepEqual(parsed.decisionKnowledge, knowledge);
});

test('MSCoE accountability KPI data is inserted alongside decision knowledge for future AI answers', () => {
  const base = 'DCCS_CONTEXT\n' + JSON.stringify({ framework: { title: 'DCCS' } });
  const knowledge = { availability: 'ready', records: [] };
  const kpis = { reportingOnly: true, metrics: [{ id: 'mscoe-trainee-census-share', currentSevenDayValue: 22 }] };
  const combined = Memory.appendDecisionKnowledge(base, knowledge, kpis);
  const parsed = JSON.parse(combined.slice('DCCS_CONTEXT\n'.length));
  assert.deepEqual(parsed.mscoeSurgeonAccountabilityKpis, kpis);
  assert.equal(parsed.decisionKnowledge.availability, 'ready');
});

test('unavailable Firestore history is represented explicitly without failing context', () => {
  const knowledge = Memory.buildDecisionKnowledge([], 'What did we decide?', null, 'unavailable', 'Offline');
  assert.equal(knowledge.availability, 'unavailable');
  assert.equal(knowledge.recordsSelected, 0);
  assert.match(knowledge.limitation, /Offline/);
});

test('Firestore adapter reads only the additive decision collection', async () => {
  const calls = [];
  const snapshot = { docs: [{ id: 'stored-decision', data: () => decision({ id: undefined }) }] };
  const query = {
    orderBy(field, direction) { calls.push(['orderBy', field, direction]); return this; },
    limit(value) { calls.push(['limit', value]); return this; },
    onSnapshot(success) { calls.push(['onSnapshot']); success(snapshot); return () => calls.push(['unsubscribe']); }
  };
  const entries = { collection(name) { calls.push(['entries', name]); return query; } };
  const rootCollection = {
    doc(name) { calls.push(['doc', name]); return entries; }
  };
  const sync = {
    enabled: true,
    db: { collection(name) { calls.push(['collection', name]); return rootCollection; } }
  };
  const store = Memory.createDecisionMemoryStore();
  store.subscribe(sync);
  await store.initialSnapshot;

  assert.deepEqual(calls.slice(0, 5), [
    ['collection', 'dccs_data'],
    ['doc', 'decisions'],
    ['entries', 'entries'],
    ['orderBy', 'createdAt', 'desc'],
    ['limit', Memory.SOURCE_LIMIT]
  ]);
  assert.equal(store.state.availability, 'ready');
  assert.equal(store.state.records[0].id, 'stored-decision');
});

test('assistant integration preserves its base context and appends narrow decision rules', async () => {
  const store = Memory.createDecisionMemoryStore();
  store.state.availability = 'ready';
  store.state.records = [decision()];
  store.markUnavailable = () => {};
  const assistant = {
    dependenciesPromise: Promise.resolve(),
    DCCS_CONTEXT_RULES: 'Existing rules.',
    getActiveServiceLineId: () => 'pcsl',
    getMetricStore: () => ({
      'er-total-census': [{ date: '2026-07-19', value: 100 }],
      'er-total-trainees': [{ date: '2026-07-19', value: 22 }],
      'er-esi-4-5': [{ date: '2026-07-19', value: 9 }]
    }),
    buildDccsContext: () => 'DCCS_CONTEXT\n' + JSON.stringify({ existing: true })
  };
  const timerHost = { setTimeout: callback => { callback(); return 1; } };

  assert.equal(Memory.installAssistantIntegration(assistant, store, timerHost), true);
  await assistant.dependenciesPromise;
  const combined = assistant.buildDccsContext('What should we do about PCSL access?');
  const parsed = JSON.parse(combined.slice('DCCS_CONTEXT\n'.length));
  assert.equal(parsed.existing, true);
  assert.equal(parsed.decisionKnowledge.availability, 'ready');
  assert.equal(parsed.mscoeSurgeonAccountabilityKpis.reportingOnly, true);
  assert.equal(parsed.mscoeSurgeonAccountabilityKpis.metrics[0].currentSevenDayValue, 22);
  assert.match(assistant.DCCS_CONTEXT_RULES, /DCCS DECISION KNOWLEDGE/);
  assert.match(assistant.DCCS_CONTEXT_RULES, /MSCOE SURGEON ACCOUNTABILITY KPIS/);
  assert.equal(Memory.installAssistantIntegration(assistant, store, timerHost), false);
});

test('the decision-memory source contains no Firestore write operations', () => {
  const source = fs.readFileSync(path.join(__dirname, '../js/ask-dr-holtkamp-decisions.js'), 'utf8');
  assert.equal(Memory.DECISION_PATH, 'dccs_data/decisions/entries');
  assert.doesNotMatch(source, /\.add\s*\(|\.update\s*\(|\.delete\s*\(/);
  assert.doesNotMatch(source, /sync\.db[\s\S]{0,240}\.set\s*\(/);
  assert.doesNotMatch(source, /saveMetricSeries|saveDialogueEntries|updateTaskStatus|updateTaskKpi/);
});
