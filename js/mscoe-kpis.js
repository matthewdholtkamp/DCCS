// MSCoE Surgeon accountability KPI definitions and derived-ratio calculations.
// Raw ER census, trainee, and Cat 4/5 entry series remain unchanged.
(function (root) {
  'use strict';

  const DAY_MS = 24 * 60 * 60 * 1000;
  const METRICS = Object.freeze({
    traineeCensusShare: Object.freeze({
      id: 'mscoe-trainee-census-share',
      label: 'Trainees as % of ER Census',
      shortLabel: 'Trainee share of ER census',
      numeratorId: 'er-total-trainees',
      denominatorId: 'er-total-census',
      numeratorLabel: 'Total trainees',
      denominatorLabel: 'Total ER census',
      decimals: 1,
      greenMax: 20,
      greenInclusive: false,
      amberMax: 25,
      targetText: 'Green <20% · Amber 20–25% · Red >25%'
    }),
    lowAcuityShare: Object.freeze({
      id: 'mscoe-low-acuity-share',
      label: 'Cat 4/5 as % of Trainees',
      shortLabel: 'Cat 4/5 share of trainees',
      numeratorId: 'er-esi-4-5',
      denominatorId: 'er-total-trainees',
      numeratorLabel: 'Cat 4/5 trainees',
      denominatorLabel: 'Total trainees',
      decimals: 1,
      greenMax: 33,
      greenInclusive: true,
      amberMax: 40,
      targetText: 'Green ≤33% · Amber >33–40% · Red >40%'
    })
  });

  const AI_CONTEXT_RULES = `

============================================================
MSCOE SURGEON ACCOUNTABILITY KPIS
============================================================
The DCCS_CONTEXT contains mscoeSurgeonAccountabilityKpis calculated from existing ER count series. Treat these derived values and classifications as authoritative; do not recompute them.

- Trainee share of ER census = total trainees divided by total ER census. Green is <20%, amber is 20–25%, and red is >25%.
- Cat 4/5 share of trainees = Cat 4/5 trainees divided by total trainees. Green is ≤33%, amber is >33–40%, and red is >40%.
- A missing or zero denominator is insufficient data, never zero percent or green.
- These KPIs remain report-only in Decision Outlook. Report and explain them, but do not recommend or create trainee decisions.`;

  function isoDate(value) {
    const text = String(value || '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
  }

  function dateMs(value) {
    const date = isoDate(value);
    return date ? Date.parse(`${date}T00:00:00Z`) : NaN;
  }

  function addDays(value, days) {
    const millis = dateMs(value);
    return Number.isFinite(millis) ? new Date(millis + days * DAY_MS).toISOString().slice(0, 10) : '';
  }

  function finite(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function round(value, decimals) {
    if (!Number.isFinite(value)) return null;
    const factor = Math.pow(10, Number.isInteger(decimals) ? decimals : 1);
    return Math.round(value * factor) / factor;
  }

  function sanitizeEntries(entries) {
    const byDate = new Map();
    (Array.isArray(entries) ? entries : []).forEach(entry => {
      const date = isoDate(entry && entry.date);
      const value = finite(entry && entry.value);
      if (!date || value === null || value < 0) return;
      byDate.set(date, { date, value });
    });
    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  }

  function getDefinition(idOrKey) {
    if (METRICS[idOrKey]) return METRICS[idOrKey];
    return Object.values(METRICS).find(metric => metric.id === idOrKey) || null;
  }

  function classify(idOrDefinition, value) {
    const definition = typeof idOrDefinition === 'object' ? idOrDefinition : getDefinition(idOrDefinition);
    const number = finite(value);
    if (!definition || number === null) return 'grey';
    const green = definition.greenInclusive ? number <= definition.greenMax : number < definition.greenMax;
    if (green) return 'green';
    if (number <= definition.amberMax) return 'amber';
    return 'red';
  }

  function statusLabel(status) {
    if (status === 'green') return 'Green';
    if (status === 'amber') return 'Amber';
    if (status === 'red') return 'Red';
    return 'Insufficient data';
  }

  function entryMap(entries) {
    return new Map(sanitizeEntries(entries).map(entry => [entry.date, entry.value]));
  }

  function ratioForRange(numeratorEntries, denominatorEntries, startDate, endDate) {
    const numerator = entryMap(numeratorEntries);
    const denominator = entryMap(denominatorEntries);
    const start = isoDate(startDate);
    const end = isoDate(endDate);
    let numeratorTotal = 0;
    let denominatorTotal = 0;
    const dates = [];

    Array.from(denominator.keys()).sort().forEach(date => {
      if (start && date < start) return;
      if (end && date > end) return;
      if (!numerator.has(date)) return;
      const den = denominator.get(date);
      const num = numerator.get(date);
      if (!Number.isFinite(den) || den <= 0 || !Number.isFinite(num)) return;
      denominatorTotal += den;
      numeratorTotal += num;
      dates.push(date);
    });

    return {
      value: denominatorTotal > 0 ? (numeratorTotal / denominatorTotal) * 100 : null,
      numeratorTotal,
      denominatorTotal,
      matchedDays: dates.length,
      startDate: dates[0] || null,
      endDate: dates[dates.length - 1] || null
    };
  }

  function ratioSeries(numeratorEntries, denominatorEntries) {
    const numerator = entryMap(numeratorEntries);
    return sanitizeEntries(denominatorEntries).map(entry => {
      if (entry.value <= 0 || !numerator.has(entry.date)) return null;
      return {
        date: entry.date,
        value: (numerator.get(entry.date) / entry.value) * 100,
        numerator: numerator.get(entry.date),
        denominator: entry.value
      };
    }).filter(Boolean);
  }

  function latestMatchedDate(numeratorEntries, denominatorEntries) {
    const series = ratioSeries(numeratorEntries, denominatorEntries);
    return series.length ? series[series.length - 1].date : null;
  }

  function getStoreEntries(store, metricId) {
    return store && Array.isArray(store[metricId]) ? store[metricId] : [];
  }

  function buildSnapshot(metricStore, idOrKey, options) {
    const definition = getDefinition(idOrKey);
    if (!definition) return null;
    const numeratorEntries = getStoreEntries(metricStore, definition.numeratorId);
    const denominatorEntries = getStoreEntries(metricStore, definition.denominatorId);
    const days = Math.max(1, Number(options && options.days) || 7);
    const endDate = isoDate(options && options.endDate)
      || latestMatchedDate(numeratorEntries, denominatorEntries);
    const startDate = endDate ? addDays(endDate, -(days - 1)) : '';
    const previousEndDate = startDate ? addDays(startDate, -1) : '';
    const previousStartDate = previousEndDate ? addDays(previousEndDate, -(days - 1)) : '';
    const current = endDate
      ? ratioForRange(numeratorEntries, denominatorEntries, startDate, endDate)
      : ratioForRange([], [], '', '');
    const previous = previousEndDate
      ? ratioForRange(numeratorEntries, denominatorEntries, previousStartDate, previousEndDate)
      : ratioForRange([], [], '', '');
    const currentValue = round(current.value, definition.decimals);
    const previousValue = round(previous.value, definition.decimals);
    const status = classify(definition, currentValue);

    return {
      id: definition.id,
      label: definition.label,
      shortLabel: definition.shortLabel,
      formula: `${definition.numeratorId} ÷ ${definition.denominatorId} × 100`,
      numeratorId: definition.numeratorId,
      denominatorId: definition.denominatorId,
      unit: '%',
      decimals: definition.decimals,
      target: definition.greenMax,
      targetInclusive: definition.greenInclusive,
      amberMax: definition.amberMax,
      targetText: definition.targetText,
      currentValue,
      previousValue,
      status,
      statusLabel: statusLabel(status),
      currentWindow: {
        startDate: current.startDate,
        endDate: current.endDate,
        matchedDays: current.matchedDays,
        numeratorTotal: current.numeratorTotal,
        denominatorTotal: current.denominatorTotal
      },
      previousWindow: {
        startDate: previous.startDate,
        endDate: previous.endDate,
        matchedDays: previous.matchedDays,
        numeratorTotal: previous.numeratorTotal,
        denominatorTotal: previous.denominatorTotal
      },
      recentDailyRatios: ratioSeries(numeratorEntries, denominatorEntries).slice(-90).map(point => ({
        date: point.date,
        value: round(point.value, definition.decimals)
      }))
    };
  }

  function buildAllSnapshots(metricStore, options) {
    return Object.keys(METRICS).map(key => buildSnapshot(metricStore, key, options)).filter(Boolean);
  }

  function buildContext(metricStore) {
    return {
      version: 'mscoe-accountability-kpis-v1',
      reportingOnly: true,
      dataEntryPolicy: 'Continue entering raw ER census, total trainee, and Cat 4/5 counts. Percentages are derived and never written back to metric storage.',
      metrics: buildAllSnapshots(metricStore).map(snapshot => ({
        id: snapshot.id,
        label: snapshot.label,
        formula: snapshot.formula,
        sourceMetricIds: [snapshot.numeratorId, snapshot.denominatorId],
        currentSevenDayValue: snapshot.currentValue,
        previousSevenDayValue: snapshot.previousValue,
        unit: snapshot.unit,
        status: snapshot.status,
        statusLabel: snapshot.statusLabel,
        thresholds: snapshot.targetText,
        currentWindow: snapshot.currentWindow,
        previousWindow: snapshot.previousWindow,
        recentDailyRatios: snapshot.recentDailyRatios
      }))
    };
  }

  function buildSitrepMetrics(metricStore, window) {
    return Object.values(METRICS).map(definition => {
      const numeratorEntries = getStoreEntries(metricStore, definition.numeratorId);
      const denominatorEntries = getStoreEntries(metricStore, definition.denominatorId);
      const current = ratioForRange(numeratorEntries, denominatorEntries, window && window.startISO, window && window.endISO);
      const previous = ratioForRange(numeratorEntries, denominatorEntries, window && window.priorStartISO, window && window.priorEndISO);
      const headline = round(current.value, definition.decimals);
      const headlinePrior = round(previous.value, definition.decimals);
      const deltaAbs = headline !== null && headlinePrior !== null
        ? round(headline - headlinePrior, definition.decimals)
        : null;
      const deltaPct = headline !== null && headlinePrior !== null && headlinePrior !== 0
        ? Math.round(((headline - headlinePrior) / Math.abs(headlinePrior)) * 100)
        : null;
      const status = classify(definition, headline);
      const signedDelta = deltaAbs === null ? null : `${deltaAbs >= 0 ? '+' : ''}${deltaAbs.toFixed(definition.decimals)} percentage points`;

      return {
        id: definition.id,
        name: definition.label,
        unit: '%',
        direction: 'lower',
        goal: definition.greenMax,
        goalInclusive: definition.greenInclusive,
        amberMax: definition.amberMax,
        targetText: definition.targetText,
        showTarget: headline !== null,
        goalState: status,
        statusBand: statusLabel(status),
        entryMode: 'derived-ratio',
        precision: definition.decimals,
        basis: 'ratio-of-matched-period-totals',
        sourceMetricIds: [definition.numeratorId, definition.denominatorId],
        thisPeriod: {
          count: current.matchedDays,
          numeratorTotal: current.numeratorTotal,
          denominatorTotal: current.denominatorTotal
        },
        priorPeriod: {
          count: previous.matchedDays,
          numeratorTotal: previous.numeratorTotal,
          denominatorTotal: previous.denominatorTotal
        },
        headline,
        headlinePrior,
        deltaAbs,
        deltaPct,
        deltaText: signedDelta || 'no prior baseline',
        improved: deltaAbs === null ? null : deltaAbs < 0
      };
    }).filter(metric => metric.thisPeriod.count > 0 || metric.priorPeriod.count > 0);
  }

  function ratioFromRows(rows, numeratorKey, denominatorKey) {
    let numeratorTotal = 0;
    let denominatorTotal = 0;
    let matchedDays = 0;
    (Array.isArray(rows) ? rows : []).forEach(row => {
      const numerator = finite(row && row[numeratorKey]);
      const denominator = finite(row && row[denominatorKey]);
      if (numerator === null || denominator === null || denominator <= 0) return;
      numeratorTotal += numerator;
      denominatorTotal += denominator;
      matchedDays += 1;
    });
    return {
      value: denominatorTotal > 0 ? (numeratorTotal / denominatorTotal) * 100 : null,
      numeratorTotal,
      denominatorTotal,
      matchedDays
    };
  }

  const API = {
    DAY_MS,
    METRICS,
    AI_CONTEXT_RULES,
    sanitizeEntries,
    getDefinition,
    classify,
    statusLabel,
    ratioForRange,
    ratioSeries,
    ratioFromRows,
    buildSnapshot,
    buildAllSnapshots,
    buildContext,
    buildSitrepMetrics
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.DCCSMscoeKpis = API;
}(typeof window !== 'undefined' ? window : null));
