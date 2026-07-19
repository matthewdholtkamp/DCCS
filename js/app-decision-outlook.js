// DCCS Decision Outlook — optional, read-only forecasting and decision workflow.
// This module intentionally does not alter service-line entry, Sync, or Ask Dr. Holtkamp.
(function (root) {
  'use strict';

  const DAY_MS = 24 * 60 * 60 * 1000;
  const FORECAST_VERSION = 'dccs-linear-v1';
  const DECISION_PATH = 'dccs_data/decisions/entries';
  const STATE_ORDER = { 'off-track': 3, 'at-risk': 2, 'on-track': 1, insufficient: 0 };
  const CONFIDENCE_ORDER = { high: 3, medium: 2, low: 1, insufficient: 0 };

  const OUTCOME_SPECS = [
    {
      id: 'pcsl-acute', metricId: 'pcsl-acute', serviceLineId: 'pcsl', service: 'PCSL',
      name: 'Acute access', cadence: 'week', unit: 'hours', decimals: 1,
      target: 24, direction: 'lower', inclusive: false, milestone: '2026-08-10',
      supportIds: ['pcsl-medic', 'pcsl-nursing', 'pcsl-sickcall'],
      action: 'Review the Care Ladder capacity flex: expand medic, sick-call, and nursing-led access where the current staffing plan permits.'
    },
    {
      id: 'pcsl-followup', metricId: 'pcsl-followup', serviceLineId: 'pcsl', service: 'PCSL',
      name: 'Follow-up access', cadence: 'week', unit: 'days', decimals: 1,
      target: 7, direction: 'lower', inclusive: false, milestone: '2026-08-10',
      supportIds: ['pcsl-medic', 'pcsl-nursing', 'pcsl-sickcall'],
      action: 'Review template capacity and Care Ladder throughput before the next access review; protect follow-up supply from nonessential demand.'
    },
    {
      id: 'surgery-total', metricId: 'surgery-total', serviceLineId: 'surgery', service: 'Surgery',
      name: 'Total surgeries', cadence: 'week', unit: 'surgeries/week', decimals: 0,
      target: 40, direction: 'higher', inclusive: true, milestone: '2027-07-01',
      supportIds: ['surgery-obgyn', 'surgery-general', 'surgery-ortho'],
      action: 'Open a focused throughput review and identify the pacing constraint: anesthesia, sterile processing, staffing, block use, or specialty divert.'
    },
    {
      id: 'mh-active-duty-off-post', metricId: 'mh-active-duty-off-post', serviceLineId: 'mental-health', service: 'Mental Health',
      name: 'Off-post Active Duty referrals', cadence: 'month', unit: 'referrals/month', decimals: 0,
      target: 6, direction: 'lower', inclusive: false, monthlyMode: 'sum', milestone: '2026-08-10',
      supportIds: ['mh-nonsudcc-visits-per-patient'],
      action: 'Review Targeted Care Model utilization and referral reasons; separate true capability or capacity gaps from avoidable network leakage.'
    },
    {
      id: 'mh-nonsudcc-visits-per-patient', metricId: 'mh-nonsudcc-visits-per-patient', serviceLineId: 'mental-health', service: 'Mental Health',
      name: 'Non-SUDCC visits per patient', cadence: 'month', unit: 'visits/patient', decimals: 2,
      target: 1.25, direction: 'lower', inclusive: true, monthlyMode: 'last',
      supportIds: ['mh-active-duty-off-post'],
      action: 'Review patient frequency against the Targeted Care Model and confirm that appointment supply is reaching the right population.'
    },
    {
      id: 'er-lwobs-rate', sourceType: 'daily-ratio', numeratorId: 'er-lwobs', denominatorId: 'er-total-census',
      serviceLineId: 'emergency', service: 'Emergency', name: 'LWOBS rate', cadence: 'week', unit: '%', decimals: 1,
      target: 1, direction: 'lower', inclusive: false, milestone: '2026-08-10',
      supportIds: ['er-total-census', 'er-total-trainees'],
      action: 'Review flow and shift-transition reliability; preserve the processes keeping LWOBS below target before adding new throughput changes.'
    },
    {
      id: 'er-trainees-average', sourceType: 'daily-average', metricId: 'er-total-trainees',
      serviceLineId: 'mscoe', service: 'MSCoE / ER', name: 'Trainees in ER', cadence: 'week', unit: 'trainees/day', decimals: 1,
      target: 10, direction: 'lower', inclusive: false, milestone: '2026-08-10',
      decisionEligible: false,
      supportIds: ['er-total-census', 'er-esi-4-5'],
      action: 'Review trainee entry-point discipline, after-hours routing, and brigade redirection before demand becomes sustained ER load.'
    },
    {
      id: 'er-low-acuity-average', sourceType: 'daily-average', metricId: 'er-esi-4-5',
      serviceLineId: 'mscoe', service: 'MSCoE / ER', name: 'Low-acuity trainees', cadence: 'week', unit: 'Cat 4/5/day', decimals: 1,
      target: 4, direction: 'lower', inclusive: false, milestone: '2026-08-10',
      decisionEligible: false,
      supportIds: ['er-total-trainees', 'er-total-census'],
      action: 'Review low-acuity redirection and medic fast-track capacity with brigade medical leadership before the next demand cycle.'
    }
  ];

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
  }

  function finite(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function syncClient() {
    return typeof Sync !== 'undefined' ? Sync : (root && root.Sync);
  }

  function isoDate(value) {
    const text = String(value || '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
  }

  function dateMs(value) {
    const date = isoDate(value);
    return date ? Date.parse(`${date}T00:00:00Z`) : NaN;
  }

  function toIsoDate(ms) {
    return new Date(ms).toISOString().slice(0, 10);
  }

  function addDays(date, days) {
    return toIsoDate(dateMs(date) + days * DAY_MS);
  }

  function addMonths(date, months) {
    const parsed = new Date(`${isoDate(date)}T00:00:00Z`);
    parsed.setUTCMonth(parsed.getUTCMonth() + months);
    return parsed.toISOString().slice(0, 10);
  }

  function sanitizeEntries(entries) {
    const byDate = new Map();
    (Array.isArray(entries) ? entries : []).forEach(entry => {
      const date = isoDate(entry && entry.date);
      const value = finite(entry && entry.value);
      if (!date || value === null) return;
      byDate.set(date, { date, value });
    });
    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  }

  function monthlyEntries(entries, mode) {
    const months = new Map();
    sanitizeEntries(entries).forEach(entry => {
      const month = entry.date.slice(0, 7);
      if (!months.has(month)) months.set(month, []);
      months.get(month).push(entry);
    });
    return Array.from(months.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([month, rows]) => ({
      date: `${month}-01`,
      value: mode === 'sum' ? rows.reduce((sum, row) => sum + row.value, 0) : rows[rows.length - 1].value,
      coverage: 1
    }));
  }

  function weeklyBuckets(entries, reducer) {
    const rows = sanitizeEntries(entries);
    if (!rows.length) return [];
    const latestMs = dateMs(rows[rows.length - 1].date);
    const earliestMs = dateMs(rows[0].date);
    const buckets = [];
    for (let end = latestMs; end >= earliestMs; end -= 7 * DAY_MS) {
      const start = end - 6 * DAY_MS;
      const windowRows = rows.filter(row => {
        const ms = dateMs(row.date);
        return ms >= start && ms <= end;
      });
      if (!windowRows.length) continue;
      const value = reducer(windowRows);
      if (!Number.isFinite(value)) continue;
      buckets.push({
        date: toIsoDate(end),
        value,
        coverage: Math.min(1, new Set(windowRows.map(row => row.date)).size / 7)
      });
    }
    return buckets.reverse();
  }

  function weeklyRatioBuckets(numeratorEntries, denominatorEntries) {
    const numerator = new Map(sanitizeEntries(numeratorEntries).map(row => [row.date, row.value]));
    const denominator = sanitizeEntries(denominatorEntries);
    if (!denominator.length) return [];
    return weeklyBuckets(denominator, rows => {
      const den = rows.reduce((sum, row) => sum + row.value, 0);
      const num = rows.reduce((sum, row) => sum + (numerator.get(row.date) || 0), 0);
      return den > 0 ? (num / den) * 100 : NaN;
    });
  }

  function linearRegression(values) {
    const n = values.length;
    const meanX = (n - 1) / 2;
    const meanY = values.reduce((sum, value) => sum + value, 0) / n;
    let numerator = 0;
    let denominator = 0;
    for (let index = 0; index < n; index++) {
      numerator += (index - meanX) * (values[index] - meanY);
      denominator += Math.pow(index - meanX, 2);
    }
    const slope = denominator ? numerator / denominator : 0;
    const intercept = meanY - slope * meanX;
    const residuals = values.map((value, index) => value - (intercept + slope * index));
    const residualVariance = n > 2
      ? residuals.reduce((sum, residual) => sum + residual * residual, 0) / (n - 2)
      : 0;
    return { n, meanX, meanY, denominator, slope, intercept, residualVariance };
  }

  function targetMet(value, spec) {
    if (!Number.isFinite(value) || !Number.isFinite(Number(spec.target))) return false;
    if (spec.direction === 'lower') return spec.inclusive ? value <= spec.target : value < spec.target;
    return spec.inclusive === false ? value > spec.target : value >= spec.target;
  }

  function targetLabel(spec) {
    const symbol = spec.direction === 'lower' ? (spec.inclusive ? '≤' : '<') : (spec.inclusive === false ? '>' : '≥');
    return `${symbol}${formatNumber(spec.target, spec.decimals)} ${spec.unit}`;
  }

  function forecastSeries(points, spec, options) {
    const asOf = isoDate(options && options.asOf) || new Date().toISOString().slice(0, 10);
    const minPoints = spec.cadence === 'month' ? 6 : 8;
    const horizon = spec.cadence === 'month' ? 3 : 12;
    const cadenceDays = spec.cadence === 'month' ? 30.4375 : 7;
    const windowPoints = (Array.isArray(points) ? points : []).slice(-(spec.cadence === 'month' ? 12 : 12));
    const latest = windowPoints[windowPoints.length - 1] || null;
    const freshnessPeriods = latest ? Math.max(0, (dateMs(asOf) - dateMs(latest.date)) / (cadenceDays * DAY_MS)) : Infinity;
    const coverage = windowPoints.length
      ? windowPoints.reduce((sum, point) => sum + (Number.isFinite(point.coverage) ? point.coverage : 1), 0) / windowPoints.length
      : 0;
    const base = {
      id: spec.id,
      metricId: spec.metricId || spec.id,
      sourceMetricIds: spec.sourceType === 'daily-ratio'
        ? [spec.numeratorId, spec.denominatorId]
        : [spec.metricId || spec.id],
      name: spec.name,
      serviceLineId: spec.serviceLineId,
      service: spec.service,
      unit: spec.unit,
      decimals: spec.decimals,
      cadence: spec.cadence,
      target: spec.target,
      targetLabel: targetLabel(spec),
      direction: spec.direction,
      inclusive: spec.inclusive,
      milestone: spec.milestone || null,
      action: spec.action,
      decisionEligible: spec.decisionEligible !== false,
      supportIds: spec.supportIds || [],
      sourceStart: windowPoints[0] ? windowPoints[0].date : null,
      sourceEnd: latest ? latest.date : null,
      current: latest ? latest.value : null,
      pointCount: windowPoints.length,
      coverage,
      freshnessPeriods,
      horizonPeriods: horizon,
      forecastVersion: FORECAST_VERSION,
      forecast: [],
      projectedTargetDate: null,
      projectedBreachDate: null,
      confidence: 'insufficient',
      state: 'insufficient',
      limitation: ''
    };

    if (windowPoints.length < minPoints) {
      base.limitation = `Need ${minPoints} ${spec.cadence === 'month' ? 'monthly' : 'weekly-equivalent'} observations; ${windowPoints.length} available.`;
      return base;
    }
    if (freshnessPeriods > 2) {
      base.limitation = `Latest value is more than two ${spec.cadence}s old.`;
      return base;
    }

    const values = windowPoints.map(point => point.value);
    const model = linearRegression(values);
    const z80 = 1.281551565545;
    const forecast = [];
    for (let step = 1; step <= horizon; step++) {
      const x = model.n - 1 + step;
      const predicted = model.intercept + model.slope * x;
      const leverage = 1 + (1 / model.n) + (model.denominator ? Math.pow(x - model.meanX, 2) / model.denominator : 0);
      const margin = z80 * Math.sqrt(Math.max(0, model.residualVariance * leverage));
      const date = spec.cadence === 'month' ? addMonths(latest.date, step) : addDays(latest.date, step * 7);
      forecast.push({
        date,
        value: Math.max(0, predicted),
        lower: Math.max(0, predicted - margin),
        upper: Math.max(0, predicted + margin)
      });
    }

    const scale = Math.max(Math.abs(model.meanY), Math.abs(Number(spec.target)), 1);
    const normalizedError = Math.sqrt(model.residualVariance) / scale;
    if (windowPoints.length >= 12 && coverage >= 0.85 && freshnessPeriods <= 1 && normalizedError <= 0.10) base.confidence = 'high';
    else if (windowPoints.length >= minPoints && coverage >= 0.70 && freshnessPeriods <= 2 && normalizedError <= 0.25) base.confidence = 'medium';
    else base.confidence = 'low';

    const finalPoint = forecast[forecast.length - 1];
    const conservative = spec.direction === 'lower' ? finalPoint.upper : finalPoint.lower;
    if (targetMet(conservative, spec)) base.state = 'on-track';
    else if (targetMet(finalPoint.value, spec)) base.state = 'at-risk';
    else base.state = 'off-track';

    const currentlyMeets = targetMet(base.current, spec);
    if (!currentlyMeets) {
      const targetPoint = forecast.find(point => targetMet(point.value, spec));
      base.projectedTargetDate = targetPoint ? targetPoint.date : null;
    } else {
      const breachPoint = forecast.find(point => !targetMet(point.value, spec));
      base.projectedBreachDate = breachPoint ? breachPoint.date : null;
    }
    base.forecast = forecast;
    return base;
  }

  function getMetricEntries(app, id) {
    if (!app || !id) return [];
    if (typeof app.getMetricEntries === 'function') return app.getMetricEntries(id) || [];
    const store = typeof app.getMetricStore === 'function' ? app.getMetricStore() : {};
    return store && Array.isArray(store[id]) ? store[id] : [];
  }

  function sourcePoints(app, spec) {
    if (spec.sourceType === 'daily-ratio') {
      return weeklyRatioBuckets(getMetricEntries(app, spec.numeratorId), getMetricEntries(app, spec.denominatorId));
    }
    if (spec.sourceType === 'daily-average') {
      return weeklyBuckets(getMetricEntries(app, spec.metricId), rows => rows.reduce((sum, row) => sum + row.value, 0) / rows.length);
    }
    const entries = getMetricEntries(app, spec.metricId);
    if (spec.cadence === 'month') return monthlyEntries(entries, spec.monthlyMode || 'last');
    return sanitizeEntries(entries).map(entry => ({ ...entry, coverage: 1 }));
  }

  function latestMetricEvidence(app, metricId) {
    const rows = sanitizeEntries(getMetricEntries(app, metricId));
    return rows[rows.length - 1] || null;
  }

  function dialogueEvidence(app, serviceLineId) {
    const entries = typeof app.getDialogueEntries === 'function' ? app.getDialogueEntries(serviceLineId) || [] : [];
    return entries.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).slice(0, 2).map(entry => ({
      date: isoDate(entry.date),
      text: String(entry.text || '').replace(/\s+/g, ' ').trim().slice(0, 260)
    })).filter(entry => entry.date && entry.text);
  }

  function buildOutlook(app, options) {
    const outcomes = OUTCOME_SPECS.map(spec => {
      const outcome = forecastSeries(sourcePoints(app, spec), spec, options || {});
      outcome.supporting = spec.supportIds.map(metricId => ({ metricId, latest: latestMetricEvidence(app, metricId) })).filter(item => item.latest);
      outcome.notes = dialogueEvidence(app, spec.serviceLineId);
      return outcome;
    });
    const decisions = outcomes.filter(outcome => outcome.decisionEligible && (outcome.state === 'off-track' || outcome.state === 'at-risk')).sort((a, b) => {
      const severity = STATE_ORDER[b.state] - STATE_ORDER[a.state];
      if (severity) return severity;
      const aDate = a.projectedBreachDate || a.milestone || '9999-12-31';
      const bDate = b.projectedBreachDate || b.milestone || '9999-12-31';
      const timing = aDate.localeCompare(bDate);
      if (timing) return timing;
      return CONFIDENCE_ORDER[b.confidence] - CONFIDENCE_ORDER[a.confidence];
    });
    const newest = outcomes.map(outcome => outcome.sourceEnd).filter(Boolean).sort().pop() || null;
    return {
      generatedAt: new Date().toISOString(),
      asOf: isoDate(options && options.asOf) || new Date().toISOString().slice(0, 10),
      newestDataDate: newest,
      outcomes,
      decisions: decisions.slice(0, 3),
      limitations: [
        'Virtual appointments are a directional count only. A 15% utilization forecast requires total appointments, which are not collected here.',
        ...outcomes.filter(outcome => outcome.state === 'insufficient').map(outcome => `${outcome.name}: ${outcome.limitation}`)
      ]
    };
  }

  function formatNumber(value, decimals) {
    const number = finite(value);
    if (number === null) return '—';
    return number.toFixed(Number.isInteger(decimals) ? decimals : 1);
  }

  function formatValue(outcome, value) {
    return `${formatNumber(value, outcome.decimals)} ${outcome.unit}`;
  }

  function stateLabel(state) {
    if (state === 'off-track') return 'Off track';
    if (state === 'at-risk') return 'At risk';
    if (state === 'on-track') return 'On track';
    return 'Insufficient data';
  }

  function confidenceLabel(confidence) {
    if (confidence === 'high') return 'High data confidence';
    if (confidence === 'medium') return 'Medium data confidence';
    if (confidence === 'low') return 'Low data confidence';
    return 'Forecast unavailable';
  }

  function formatDate(value) {
    const date = isoDate(value);
    if (!date) return '—';
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
  }

  function forecastSvg(outcome) {
    if (!outcome.forecast.length || outcome.current === null) return '<div class="outlook-chart-empty">No responsible forecast available</div>';
    const points = [{ value: outcome.current, lower: outcome.current, upper: outcome.current }, ...outcome.forecast];
    const values = points.flatMap(point => [point.lower, point.upper, point.value, outcome.target]).filter(Number.isFinite);
    let min = Math.min(...values);
    let max = Math.max(...values);
    if (min === max) { min -= 1; max += 1; }
    const width = 360;
    const height = 118;
    const left = 10;
    const right = width - 10;
    const top = 10;
    const bottom = height - 18;
    const x = index => left + ((right - left) * index / (points.length - 1));
    const y = value => bottom - ((value - min) / (max - min)) * (bottom - top);
    const upper = points.map((point, index) => `${x(index).toFixed(1)},${y(point.upper).toFixed(1)}`);
    const lower = points.slice().reverse().map((point, reverseIndex) => {
      const index = points.length - 1 - reverseIndex;
      return `${x(index).toFixed(1)},${y(point.lower).toFixed(1)}`;
    });
    const line = points.map((point, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(point.value).toFixed(1)}`).join(' ');
    const targetY = y(outcome.target);
    return `
      <svg class="outlook-forecast-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(outcome.name)} twelve-week forecast">
        <line x1="${left}" x2="${right}" y1="${targetY.toFixed(1)}" y2="${targetY.toFixed(1)}" class="outlook-target-line"></line>
        <polygon points="${upper.concat(lower).join(' ')}" class="outlook-range"></polygon>
        <path d="${line}" class="outlook-forecast-line"></path>
        <circle cx="${x(0).toFixed(1)}" cy="${y(outcome.current).toFixed(1)}" r="3.5" class="outlook-current-point"></circle>
        <text x="${left}" y="${height - 3}" class="outlook-axis-label">Now</text>
        <text x="${right}" y="${height - 3}" text-anchor="end" class="outlook-axis-label">${outcome.cadence === 'month' ? '3 months' : '12 weeks'}</text>
      </svg>`;
  }

  function outlookSnapshot(outcome) {
    const finalPoint = outcome.forecast[outcome.forecast.length - 1] || null;
    return {
      forecastVersion: outcome.forecastVersion,
      metricId: outcome.metricId,
      sourceMetricIds: outcome.sourceMetricIds,
      outlookId: outcome.id,
      sourceDates: { start: outcome.sourceStart, end: outcome.sourceEnd },
      sourceStart: outcome.sourceStart,
      sourceEnd: outcome.sourceEnd,
      pointCount: outcome.pointCount,
      currentValue: outcome.current,
      current: outcome.current,
      target: outcome.target,
      targetDate: outcome.milestone,
      direction: outcome.direction,
      confidence: outcome.confidence,
      decisionEligible: outcome.decisionEligible,
      freshness: { periods: outcome.freshnessPeriods, cadence: outcome.cadence },
      outlookState: outcome.state,
      state: outcome.state,
      projectedTargetDate: outcome.projectedTargetDate,
      projectedBreachDate: outcome.projectedBreachDate,
      forecastPoints: outcome.forecast.map(point => ({
        date: point.date,
        value: point.value,
        predictionRange: { lower: point.lower, upper: point.upper }
      })),
      horizon: finalPoint ? {
        date: finalPoint.date,
        value: finalPoint.value,
        lower: finalPoint.lower,
        upper: finalPoint.upper
      } : null
    };
  }

  const DecisionOutlook = {
    DAY_MS,
    FORECAST_VERSION,
    DECISION_PATH,
    OUTCOME_SPECS,
    sanitizeEntries,
    monthlyEntries,
    weeklyBuckets,
    weeklyRatioBuckets,
    linearRegression,
    targetMet,
    forecastSeries,
    buildOutlook,
    outlookSnapshot
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = DecisionOutlook;
  if (!root) return;

  root.DCCSDecisionOutlook = DecisionOutlook;
  root.App = root.App || {};
  Object.assign(root.App, {
    injectDecisionOutlookStyles() {
      if (document.getElementById('decision-outlook-styles')) return;
      const style = document.createElement('style');
      style.id = 'decision-outlook-styles';
      style.textContent = `
.dashboard-mode-control{position:absolute;left:0;top:50%;z-index:2;display:inline-flex;transform:translateY(-50%);padding:2px;border:1px solid #cfd4d9;border-radius:5px;background:#f4f5f6}.dashboard-mode-control button{min-width:68px;padding:5px 9px;border:0;border-radius:3px;background:transparent;color:#646b73;font:800 clamp(.55rem,.65vw,.7rem)/1.1 inherit;letter-spacing:.04em;text-transform:uppercase;cursor:pointer}.dashboard-mode-control button[aria-pressed="true"]{background:#1d1f23;color:#fff}.dashboard-mode-control button:focus-visible{outline:3px solid rgba(255,184,28,.55);outline-offset:2px}
.decision-outlook,.decision-outlook *{box-sizing:border-box}.decision-outlook{height:calc(100vh - 64px);overflow:auto;padding:clamp(10px,1.4vh,18px) clamp(12px,1.7vw,26px) 28px;background:#f5f6f7;color:#1d1f23;font-family:inherit}.outlook-header{padding-bottom:10px;border-bottom:1px solid #ccd1d6}.outlook-title-row{position:relative;display:flex;align-items:center;justify-content:center;min-height:40px}.outlook-title{margin:0;font-size:clamp(1.35rem,2vw,2rem);font-weight:850;letter-spacing:.045em;text-transform:uppercase}.outlook-asof{position:absolute;right:0;color:#646b73;font-size:.78rem;font-weight:750}.outlook-subtitle{max-width:860px;margin:5px auto 0;color:#555d66;font-size:.88rem;line-height:1.4;text-align:center}.outlook-freshness{display:flex;align-items:center;gap:10px;margin:12px 0 0;padding:8px 10px;border-left:3px solid #2f6f9f;background:#eaf4fb;color:#303b44;font-size:.76rem;line-height:1.35}.outlook-freshness strong{color:#2f6f9f;text-transform:uppercase;letter-spacing:.06em}.outlook-section{margin-top:18px}.outlook-section-head{display:flex;align-items:end;justify-content:space-between;gap:14px;padding-bottom:7px;border-bottom:1px solid #d8dce0}.outlook-section-head h2{margin:0;font-size:.88rem;font-weight:850;letter-spacing:.08em;text-transform:uppercase}.outlook-section-head p{margin:0;color:#6c737b;font-size:.72rem}.outlook-decision-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;background:#d9dde1;border:1px solid #d9dde1}.outlook-decision{min-width:0;padding:13px 14px;background:#fff;border-top:3px solid var(--outlook-tone,#747b84)}.outlook-decision[data-state="off-track"]{--outlook-tone:#b82e27}.outlook-decision[data-state="at-risk"]{--outlook-tone:#a97000}.outlook-decision[data-state="on-track"]{--outlook-tone:#25813e}.outlook-decision-top{display:flex;align-items:center;justify-content:space-between;gap:8px}.outlook-service{color:#646b73;font-size:.62rem;font-weight:850;letter-spacing:.08em;text-transform:uppercase}.outlook-state{color:var(--outlook-tone);font-size:.68rem;font-weight:850;text-transform:uppercase}.outlook-decision h3{margin:8px 0 4px;font-size:1rem}.outlook-decision p{margin:0;color:#565d65;font-size:.76rem;line-height:1.42}.outlook-decision-readout{display:flex;align-items:baseline;gap:5px;margin:10px 0 8px}.outlook-decision-readout strong{color:var(--outlook-tone);font-size:1.35rem}.outlook-decision-readout span{color:#6c737b;font-size:.68rem}.outlook-action-link{margin-top:11px;padding:0;border:0;background:transparent;color:#2f6f9f;font:800 .72rem/1.2 inherit;cursor:pointer;text-decoration:underline;text-underline-offset:3px}.outlook-action-link:focus-visible,.outlook-btn:focus-visible,.outlook-form :is(input,select,textarea,button):focus-visible,.outlook-review :is(select,textarea,button):focus-visible{outline:3px solid rgba(255,184,28,.5);outline-offset:2px}.outlook-grid{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(300px,.75fr);gap:16px}.outlook-forecast-table{border-top:1px solid #cfd4d9}.outlook-forecast-row{display:grid;grid-template-columns:minmax(170px,.95fr) minmax(230px,1.25fr) minmax(170px,.8fr);gap:14px;align-items:center;padding:12px 0;border-bottom:1px solid #d9dde1}.outlook-metric-name{font-size:.82rem;font-weight:850}.outlook-metric-meta{margin-top:4px;color:#6c737b;font-size:.68rem;line-height:1.35}.outlook-metric-state{display:inline-block;margin-top:6px;color:var(--outlook-tone,#747b84);font-size:.65rem;font-weight:850;text-transform:uppercase}.outlook-forecast-row[data-state="off-track"]{--outlook-tone:#b82e27}.outlook-forecast-row[data-state="at-risk"]{--outlook-tone:#a97000}.outlook-forecast-row[data-state="on-track"]{--outlook-tone:#25813e}.outlook-forecast-svg{width:100%;height:94px;display:block}.outlook-range{fill:rgba(47,111,159,.14)}.outlook-forecast-line{fill:none;stroke:#2f6f9f;stroke-width:2}.outlook-current-point{fill:#1d1f23}.outlook-target-line{stroke:#a97000;stroke-width:1;stroke-dasharray:4 3}.outlook-axis-label{fill:#747b84;font-size:9px}.outlook-chart-empty{padding:24px 8px;color:#747b84;font-size:.72rem;text-align:center;border:1px dashed #cfd4d9}.outlook-horizon{font-size:.75rem;line-height:1.45}.outlook-horizon strong{display:block;font-size:1rem}.outlook-horizon span{color:#6c737b}.outlook-inspector{align-self:start;position:sticky;top:8px;padding:14px 15px;background:#fff;border:1px solid #d9dde1;border-top:3px solid #2f6f9f}.outlook-inspector h2{margin:0;font-size:.92rem}.outlook-inspector-copy{margin:5px 0 12px;color:#606871;font-size:.74rem;line-height:1.45}.outlook-inspector-block{padding:10px 0;border-top:1px solid #e1e4e7}.outlook-inspector-label{display:block;margin-bottom:4px;color:#747b84;font-size:.62rem;font-weight:850;letter-spacing:.07em;text-transform:uppercase}.outlook-evidence{margin:0;padding-left:17px;color:#4f565d;font-size:.72rem;line-height:1.5}.outlook-note{margin:7px 0 0;padding-left:9px;border-left:2px solid #c9a33b;color:#596068;font-size:.7rem;line-height:1.45}.outlook-note time{font-weight:800}.outlook-btn{display:inline-flex;align-items:center;justify-content:center;padding:8px 11px;border:1px solid #2f6f9f;border-radius:4px;background:#2f6f9f;color:#fff;font:800 .72rem/1.2 inherit;cursor:pointer}.outlook-btn.secondary{background:#fff;color:#2f6f9f}.outlook-form{display:grid;gap:8px}.outlook-form label,.outlook-review label{display:grid;gap:4px;color:#5b626a;font-size:.65rem;font-weight:750}.outlook-form :is(input,select,textarea),.outlook-review :is(select,textarea){width:100%;padding:7px 8px;border:1px solid #cbd0d5;border-radius:4px;background:#fff;color:#1d1f23;font:inherit}.outlook-form textarea,.outlook-review textarea{min-height:62px;resize:vertical}.outlook-form-row{display:grid;grid-template-columns:1fr 1fr;gap:8px}.outlook-status{min-height:1.2em;color:#2f6f9f;font-size:.68rem;font-weight:750}.outlook-scenario{padding:13px 14px;background:#fff;border:1px solid #d9dde1}.outlook-scenario-controls{display:grid;grid-template-columns:minmax(180px,1fr) minmax(130px,.55fr);gap:10px}.outlook-scenario-result{margin-top:10px;padding:9px 10px;border-left:3px solid #a97000;background:#fff8e8;color:#4f4a3d;font-size:.74rem;line-height:1.45}.outlook-limitations{margin:8px 0 0;padding-left:18px;color:#596068;font-size:.72rem;line-height:1.5}.outlook-log{display:grid;gap:8px}.outlook-log-empty{padding:14px;border:1px dashed #cfd4d9;color:#747b84;font-size:.74rem}.outlook-log details{background:#fff;border:1px solid #d9dde1}.outlook-log summary{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:10px;align-items:center;padding:10px 12px;cursor:pointer}.outlook-log summary strong{font-size:.76rem}.outlook-log summary span{color:#6c737b;font-size:.68rem}.outlook-review{display:grid;gap:8px;padding:11px 12px;border-top:1px solid #e1e4e7}.outlook-review-actions{display:flex;gap:8px;flex-wrap:wrap}.outlook-disclaimer{margin:18px 0 0;padding-top:8px;border-top:1px solid #d0d5da;color:#747b84;font-size:.66rem;line-height:1.4;text-align:center}.outlook-loading{padding:40px;color:#646b73;text-align:center}.outlook-hidden{display:none!important}
.outlook-scenario-controls label{display:grid;gap:4px;margin:0}.outlook-scenario-controls :is(select,input){width:100%;padding:7px 8px;border:1px solid #cbd0d5;border-radius:4px;background:#fff;color:#1d1f23;font:inherit}
@media (max-width:1100px){.outlook-decision-list{grid-template-columns:1fr}.outlook-grid{grid-template-columns:1fr}.outlook-inspector{position:static}.outlook-forecast-row{grid-template-columns:minmax(150px,.8fr) minmax(220px,1.2fr) minmax(150px,.7fr)}}
@media (max-width:760px){.dashboard-mode-control{position:static;transform:none;margin-right:auto}.exsum-title-row,.outlook-title-row{flex-wrap:wrap;justify-content:space-between;gap:6px}.exsum-title,.outlook-title{order:-1;width:100%;font-size:1.08rem;text-align:center}.exsum-asof,.outlook-asof{position:static;transform:none}.decision-outlook{padding:9px 10px 24px}.outlook-subtitle{text-align:left}.outlook-section-head{align-items:start;flex-direction:column;gap:3px}.outlook-forecast-row{grid-template-columns:1fr}.outlook-forecast-svg{height:112px}.outlook-form-row,.outlook-scenario-controls{grid-template-columns:1fr}.outlook-log summary{grid-template-columns:1fr}.outlook-log summary span{display:block}}
@media (prefers-reduced-motion:reduce){.decision-outlook *{scroll-behavior:auto!important;transition:none!important}}
      `;
      document.head.appendChild(style);
    },

    injectDashboardModeControl(el, mode) {
      this.injectDecisionOutlookStyles();
      const host = el.querySelector('.exsum-title-row, .outlook-title-row');
      if (!host || host.querySelector('.dashboard-mode-control')) return;
      const control = document.createElement('div');
      control.className = 'dashboard-mode-control';
      control.setAttribute('role', 'group');
      control.setAttribute('aria-label', 'Dashboard view');
      control.innerHTML = `
        <button type="button" data-dashboard-mode="current" aria-pressed="${mode === 'current'}">Current</button>
        <button type="button" data-dashboard-mode="outlook" aria-pressed="${mode === 'outlook'}">Outlook</button>`;
      control.addEventListener('click', event => {
        const button = event.target.closest('[data-dashboard-mode]');
        if (!button) return;
        const main = document.getElementById('app');
        if (button.dataset.dashboardMode === 'outlook') this.renderDecisionOutlook(main);
        else this.renderDashboard(main);
      });
      host.prepend(control);
    },

    destroyDecisionOutlook() {
      this._decisionOutlookActive = false;
      if (this._decisionOutlookUnsubscribe) {
        this._decisionOutlookUnsubscribe();
        this._decisionOutlookUnsubscribe = null;
      }
      if (this._decisionOutlookRefreshTimer) {
        clearTimeout(this._decisionOutlookRefreshTimer);
        this._decisionOutlookRefreshTimer = null;
      }
      if (this._decisionOutlookHydrationTimer) {
        clearTimeout(this._decisionOutlookHydrationTimer);
        this._decisionOutlookHydrationTimer = null;
      }
    },

    decisionOutlookHydrationState() {
      const sync = syncClient();
      if (!sync) return { ready: false, message: 'The synchronization cache is unavailable.' };
      if (!sync.enabled) return { ready: false, message: 'Firestore is unavailable. Outlook will not forecast from an unverified partial cache.' };
      if (sync._hasRecoveredMetrics === true) return { ready: true, message: '' };
      if (sync.migrationDeferred && sync.unsubscribe && sync.status === 'synced') return { ready: true, message: '' };
      return { ready: false, message: 'Waiting for the complete Firestore metric snapshot before calculating forecasts…' };
    },

    renderDecisionOutlookLoading(el, hydration) {
      this._decisionOutlookActive = true;
      el.innerHTML = `
        <section class="decision-outlook" id="decision-outlook" aria-label="DCCS twelve-week decision outlook">
          <header class="outlook-header">
            <div class="outlook-title-row"><h1 class="outlook-title">DCCS — Decision Outlook</h1><span class="outlook-asof">Data check</span></div>
            <p class="outlook-subtitle">A transparent twelve-week projection from the same data already entered on service-line pages.</p>
          </header>
          <div class="outlook-loading" role="status">${escapeHtml(hydration.message)}</div>
        </section>`;
      this.injectDashboardModeControl(el, 'outlook');
      if (syncClient()?.enabled) {
        this._decisionOutlookHydrationTimer = setTimeout(() => {
          if (this._decisionOutlookActive && location.hash === '#/dashboard') this.renderDecisionOutlook(el);
        }, 150);
      }
    },

    renderDecisionOutlook(el) {
      this.injectDecisionOutlookStyles();
      if (this._exsumChart) {
        this._exsumChart.destroy();
        this._exsumChart = null;
      }
      if (this._exsumCampaignUnsubscribe) {
        this._exsumCampaignUnsubscribe();
        this._exsumCampaignUnsubscribe = null;
      }
      this._exsumRoot = null;
      this._decisionOutlookActive = true;
      const hydration = this.decisionOutlookHydrationState();
      if (!hydration.ready) {
        this.renderDecisionOutlookLoading(el, hydration);
        return;
      }
      if (this._decisionOutlookHydrationTimer) {
        clearTimeout(this._decisionOutlookHydrationTimer);
        this._decisionOutlookHydrationTimer = null;
      }
      const previous = this._decisionOutlookState || {};
      const outlook = buildOutlook(this, {});
      const defaultSelection = outlook.decisions[0]
        || outlook.outcomes.find(item => item.decisionEligible && item.state !== 'insufficient')
        || outlook.outcomes.find(item => item.decisionEligible);
      const selectedId = outlook.outcomes.some(item => item.id === previous.selectedId && item.decisionEligible)
        ? previous.selectedId
        : defaultSelection && defaultSelection.id;
      const scenarioId = outlook.outcomes.some(item => item.id === previous.scenarioId)
        ? previous.scenarioId
        : selectedId || outlook.outcomes[0]?.id;
      this._decisionOutlookState = {
        ...previous,
        outlook,
        selectedId,
        scenarioId,
        decisions: Array.isArray(previous.decisions) ? previous.decisions : [],
        status: previous.status || '',
        supersedesId: previous.supersedesId || null
      };
      el.innerHTML = this.renderDecisionOutlookMarkup();
      this.injectDashboardModeControl(el, 'outlook');
      this.bindDecisionOutlookEvents(el);
      this.subscribeDecisionLog();
    },

    renderDecisionOutlookMarkup() {
      const state = this._decisionOutlookState;
      const outlook = state.outlook;
      const selected = outlook.outcomes.find(item => item.id === state.selectedId && item.decisionEligible)
        || outlook.outcomes.find(item => item.decisionEligible);
      const scenario = outlook.outcomes.find(item => item.id === state.scenarioId) || selected || outlook.outcomes[0];
      const decisions = outlook.decisions;
      const decisionMarkup = decisions.map((outcome, index) => {
        const finalPoint = outcome.forecast[outcome.forecast.length - 1];
        return `
          <article class="outlook-decision" data-state="${escapeHtml(outcome.state)}">
            <div class="outlook-decision-top"><span class="outlook-service">${index + 1} · ${escapeHtml(outcome.service)}</span><span class="outlook-state">${escapeHtml(stateLabel(outcome.state))}</span></div>
            <h3>${escapeHtml(outcome.name)}</h3>
            <p>${escapeHtml(outcome.action)}</p>
            <div class="outlook-decision-readout"><strong>${escapeHtml(formatValue(outcome, outcome.current))}</strong><span>current · target ${escapeHtml(outcome.targetLabel)}</span></div>
            <p>${finalPoint ? `Projected ${escapeHtml(formatValue(outcome, finalPoint.value))} by ${escapeHtml(formatDate(finalPoint.date))}.` : escapeHtml(outcome.limitation)}</p>
            <button class="outlook-action-link" type="button" data-outlook-select="${escapeHtml(outcome.id)}">Review evidence and decision →</button>
          </article>`;
      }).join('');
      const forecastRows = outlook.outcomes.map(outcome => {
        const finalPoint = outcome.forecast[outcome.forecast.length - 1];
        return `
          <article class="outlook-forecast-row" data-state="${escapeHtml(outcome.state)}">
            <div>
              <div class="outlook-metric-name">${escapeHtml(outcome.service)} · ${escapeHtml(outcome.name)}</div>
              <div class="outlook-metric-meta">${escapeHtml(formatValue(outcome, outcome.current))} current · target ${escapeHtml(outcome.targetLabel)}<br>${escapeHtml(confidenceLabel(outcome.confidence))} · ${outcome.pointCount} periods${outcome.decisionEligible ? '' : ' · Report only'}</div>
              <span class="outlook-metric-state">${escapeHtml(stateLabel(outcome.state))}</span>
            </div>
            <div>${forecastSvg(outcome)}</div>
            <div class="outlook-horizon">
              ${finalPoint ? `<strong>${escapeHtml(formatValue(outcome, finalPoint.value))}</strong><span>80% range ${escapeHtml(formatNumber(finalPoint.lower, outcome.decimals))}–${escapeHtml(formatNumber(finalPoint.upper, outcome.decimals))} ${escapeHtml(outcome.unit)}<br>through ${escapeHtml(formatDate(finalPoint.date))}</span>` : `<strong>Forecast unavailable</strong><span>${escapeHtml(outcome.limitation)}</span>`}
            </div>
          </article>`;
      }).join('');
      const newestText = outlook.newestDataDate ? `Newest source data: ${formatDate(outlook.newestDataDate)}` : 'Waiting for metric history';
      return `
        <section class="decision-outlook" id="decision-outlook" aria-label="DCCS twelve-week decision outlook">
          <header class="outlook-header">
            <div class="outlook-title-row"><h1 class="outlook-title">DCCS — Decision Outlook</h1><span class="outlook-asof">As of ${escapeHtml(formatDate(outlook.asOf))}</span></div>
            <p class="outlook-subtitle">A transparent twelve-week projection from the same data already entered on service-line pages. It does not change collection, tasks, KPIs, or reporting.</p>
          </header>
          <div class="outlook-freshness" role="status"><strong>Data check</strong><span>${escapeHtml(newestText)} · ${outlook.outcomes.filter(item => item.state !== 'insufficient').length}/${outlook.outcomes.length} outcome forecasts available.</span></div>

          <section class="outlook-section" aria-labelledby="outlook-decisions-title">
            <div class="outlook-section-head"><h2 id="outlook-decisions-title">Decisions requiring attention</h2><p>Hospital-controlled items ranked by target risk, timing, and data confidence</p></div>
            <div class="outlook-decision-list">${decisionMarkup || '<div class="outlook-log-empty">No hospital-controlled target risks are currently projected.</div>'}</div>
          </section>

          <section class="outlook-section outlook-grid" aria-label="Forecasts and selected decision">
            <div>
              <div class="outlook-section-head"><h2>Twelve-week KPI forecast</h2><p>Central estimate with an 80% prediction range</p></div>
              <div class="outlook-forecast-table">${forecastRows}</div>
            </div>
            <aside class="outlook-inspector" id="outlook-inspector">${this.renderDecisionInspector(selected)}</aside>
          </section>

          <section class="outlook-section" aria-labelledby="outlook-scenario-title">
            <div class="outlook-section-head"><h2 id="outlook-scenario-title">What-if scenario</h2><p>An explicit assumption, not a causal prediction</p></div>
            ${this.renderOutlookScenario(scenario)}
          </section>

          <section class="outlook-section" aria-labelledby="outlook-log-title">
            <div class="outlook-section-head"><h2 id="outlook-log-title">Shared decision log</h2><p>Decisions are separate from metrics, tasks, and dialogue</p></div>
            <div class="outlook-log" id="outlook-decision-log">${this.renderDecisionLog()}</div>
          </section>

          <section class="outlook-section" aria-labelledby="outlook-limitations-title">
            <div class="outlook-section-head"><h2 id="outlook-limitations-title">Limits and data gaps</h2><p>Forecasts describe direction; they do not establish cause</p></div>
            <ul class="outlook-limitations">${outlook.limitations.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
          </section>
          <p class="outlook-disclaimer">Operational decision support only. Forecasts are derived from existing reported series and should be reviewed alongside mission context and leader judgment. UNCLASSIFIED.</p>
        </section>`;
    },

    renderDecisionInspector(outcome) {
      if (!outcome) return '<div class="outlook-loading">Select a forecast to review.</div>';
      if (!outcome.decisionEligible) {
        return `<h2>${escapeHtml(outcome.service)} · ${escapeHtml(outcome.name)}</h2><p class="outlook-inspector-copy">This KPI is report-only and is not available for decision recommendations, BAND-AID 6 decision prompts, or decision recording.</p>`;
      }
      const supporting = outcome.supporting.length
        ? outcome.supporting.map(item => `<li>${escapeHtml(item.metricId)}: ${escapeHtml(formatNumber(item.latest.value, 1))} on ${escapeHtml(formatDate(item.latest.date))}</li>`).join('')
        : '<li>No supporting metric is configured.</li>';
      const notes = outcome.notes.length
        ? outcome.notes.map(note => `<p class="outlook-note"><time>${escapeHtml(formatDate(note.date))}</time> · ${escapeHtml(note.text)}</p>`).join('')
        : '<p class="outlook-note">No recent operational note is available for this service line.</p>';
      const owner = typeof this.getCurrentUser === 'function' ? this.getCurrentUser() : 'DCCS';
      const reviewDate = addDays(new Date().toISOString().slice(0, 10), 14);
      return `
        <h2>${escapeHtml(outcome.service)} · ${escapeHtml(outcome.name)}</h2>
        <p class="outlook-inspector-copy">${escapeHtml(outcome.action)}</p>
        <div class="outlook-inspector-block"><span class="outlook-inspector-label">Forecast evidence</span><ul class="outlook-evidence"><li>Current: ${escapeHtml(formatValue(outcome, outcome.current))}</li><li>Target: ${escapeHtml(outcome.targetLabel)}</li><li>Source: ${escapeHtml(formatDate(outcome.sourceStart))}–${escapeHtml(formatDate(outcome.sourceEnd))}</li><li>${escapeHtml(confidenceLabel(outcome.confidence))}</li>${supporting}</ul></div>
        <div class="outlook-inspector-block"><span class="outlook-inspector-label">Recent operational context</span>${notes}</div>
        <div class="outlook-inspector-block"><button type="button" class="outlook-btn secondary" data-outlook-discuss="${escapeHtml(outcome.id)}">Discuss with BAND-AID 6</button></div>
        <form class="outlook-form outlook-inspector-block" id="outlook-decision-form">
          <span class="outlook-inspector-label">Record a decision</span>
          <label>Course of action<select id="outlook-course"><option value="recommended">Recommended action</option><option value="monitor">Monitor through the next cycle</option><option value="collect-evidence">Collect more evidence first</option></select></label>
          <div class="outlook-form-row"><label>Owner<input id="outlook-owner" value="${escapeHtml(owner)}" maxlength="100"></label><label>Review date<input id="outlook-review-date" type="date" value="${escapeHtml(reviewDate)}"></label></div>
          <label>Rationale<textarea id="outlook-rationale" maxlength="800" placeholder="Why this course of action is appropriate..."></textarea></label>
          ${this._decisionOutlookState.supersedesId ? `<p class="outlook-status">This will supersede decision ${escapeHtml(this._decisionOutlookState.supersedesId)}.</p>` : ''}
          <button type="submit" class="outlook-btn">Review and record</button>
          <div class="outlook-status" id="outlook-save-status" aria-live="polite">${escapeHtml(this._decisionOutlookState.status || '')}</div>
        </form>`;
    },

    renderOutlookScenario(outcome) {
      const options = this._decisionOutlookState.outlook.outcomes.map(item => `<option value="${escapeHtml(item.id)}"${item.id === outcome.id ? ' selected' : ''}>${escapeHtml(item.service)} · ${escapeHtml(item.name)}</option>`).join('');
      return `
        <div class="outlook-scenario">
          <div class="outlook-scenario-controls">
            <label class="outlook-inspector-label">Outcome<select id="outlook-scenario-outcome">${options}</select></label>
            <label class="outlook-inspector-label">Assumed change per ${outcome.cadence}<input id="outlook-scenario-change" type="number" step="0.1" value="0"></label>
          </div>
          <div class="outlook-scenario-result" id="outlook-scenario-result">Enter a signed change per ${escapeHtml(outcome.cadence)}. This changes the displayed projection only and is not saved.</div>
        </div>`;
    },

    renderDecisionLog() {
      const decisions = this._decisionOutlookState && this._decisionOutlookState.decisions || [];
      if (!decisions.length) return '<div class="outlook-log-empty">No shared decisions recorded yet.</div>';
      return decisions.map(decision => `
        <details>
          <summary><strong>${escapeHtml(decision.service || '')} · ${escapeHtml(decision.outcomeName || 'Decision')}</strong><span>${escapeHtml(decision.status || 'open')} · owner ${escapeHtml(decision.owner || '—')}</span><span>Review ${escapeHtml(formatDate(decision.reviewDate))}</span></summary>
          <div class="outlook-review" data-decision-id="${escapeHtml(decision.id)}">
            <p class="outlook-inspector-copy">${escapeHtml(decision.action || '')}<br>${escapeHtml(decision.rationale || '')}</p>
            <label>Status<select data-review-status><option value="reviewed"${decision.status === 'reviewed' ? ' selected' : ''}>Reviewed</option><option value="closed"${decision.status === 'closed' ? ' selected' : ''}>Closed</option><option value="superseded"${decision.status === 'superseded' ? ' selected' : ''}>Superseded</option></select></label>
            <label>Outcome<textarea data-review-outcome maxlength="800" placeholder="What happened after the decision?">${escapeHtml(decision.outcome || '')}</textarea></label>
            <div class="outlook-review-actions"><button type="button" class="outlook-btn" data-save-review="${escapeHtml(decision.id)}">Review and save outcome</button><button type="button" class="outlook-btn secondary" data-supersede="${escapeHtml(decision.id)}">Create superseding decision</button></div>
          </div>
        </details>`).join('');
    },

    bindDecisionOutlookEvents(el) {
      el.querySelectorAll('[data-outlook-select]').forEach(button => button.addEventListener('click', () => {
        this._decisionOutlookState.selectedId = button.dataset.outlookSelect;
        this._decisionOutlookState.supersedesId = null;
        this.renderDecisionOutlook(el);
        document.getElementById('outlook-inspector')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }));
      el.querySelector('[data-outlook-discuss]')?.addEventListener('click', event => this.discussDecisionOutlook(event.currentTarget.dataset.outlookDiscuss));
      el.querySelector('#outlook-decision-form')?.addEventListener('submit', event => {
        event.preventDefault();
        this.confirmDecisionRecord();
      });
      this.bindScenarioEvents(el);
      this.bindDecisionLogEvents(el);
      el.addEventListener('focusout', () => {
        if (!this._decisionOutlookPendingRefresh) return;
        setTimeout(() => {
          const active = document.activeElement;
          if (!el.contains(active) || !/^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)) {
            this._decisionOutlookPendingRefresh = false;
            this.renderDecisionOutlook(el);
          }
        }, 0);
      });
    },

    bindScenarioEvents(el) {
      const select = el.querySelector('#outlook-scenario-outcome');
      const input = el.querySelector('#outlook-scenario-change');
      if (select) select.addEventListener('change', () => {
        this._decisionOutlookState.scenarioId = select.value;
        const outcome = this._decisionOutlookState.outlook.outcomes.find(item => item.id === select.value);
        const scenario = el.querySelector('.outlook-scenario');
        if (scenario && outcome) {
          scenario.outerHTML = this.renderOutlookScenario(outcome);
          this.bindScenarioEvents(el);
        }
      });
      if (input) input.addEventListener('input', () => this.updateOutlookScenario());
    },

    bindDecisionLogEvents(el) {
      el.querySelectorAll('[data-save-review]').forEach(button => button.addEventListener('click', () => this.confirmDecisionReview(button.dataset.saveReview)));
      el.querySelectorAll('[data-supersede]').forEach(button => button.addEventListener('click', () => this.prepareSupersedingDecision(button.dataset.supersede)));
    },

    updateOutlookScenario() {
      const state = this._decisionOutlookState;
      const outcomeId = document.getElementById('outlook-scenario-outcome')?.value;
      const outcome = state.outlook.outcomes.find(item => item.id === outcomeId);
      const change = finite(document.getElementById('outlook-scenario-change')?.value);
      const result = document.getElementById('outlook-scenario-result');
      if (!result || !outcome) return;
      if (change === null || !outcome.forecast.length) {
        result.textContent = outcome.limitation || 'Enter a numeric assumption to compare against the baseline.';
        return;
      }
      const baseline = outcome.forecast[outcome.forecast.length - 1];
      const scenarioValue = Math.max(0, baseline.value + change * outcome.horizonPeriods);
      const scenarioState = targetMet(scenarioValue, OUTCOME_SPECS.find(item => item.id === outcome.id));
      result.textContent = `Assumption: ${change >= 0 ? '+' : ''}${formatNumber(change, outcome.decimals)} ${outcome.unit} per ${outcome.cadence}. Baseline horizon: ${formatValue(outcome, baseline.value)}. Scenario horizon: ${formatValue(outcome, scenarioValue)} — ${scenarioState ? 'meets' : 'does not meet'} the ${outcome.targetLabel} target. This is arithmetic based on your assumption, not a causal forecast.`;
    },

    discussDecisionOutlook(outcomeId) {
      const outcome = this._decisionOutlookState.outlook.outcomes.find(item => item.id === outcomeId);
      const assistant = typeof AskDrHoltkamp !== 'undefined' ? AskDrHoltkamp : root.AskDrHoltkamp;
      if (!outcome || !outcome.decisionEligible || !assistant) return;
      const finalPoint = outcome.forecast[outcome.forecast.length - 1];
      const prompt = [
        'DCCS DECISION OUTLOOK REVIEW',
        `Outcome: ${outcome.service} — ${outcome.name}`,
        `Current: ${formatValue(outcome, outcome.current)} as of ${outcome.sourceEnd}`,
        `Target: ${outcome.targetLabel}`,
        finalPoint ? `Twelve-week projection: ${formatValue(outcome, finalPoint.value)} (80% range ${formatNumber(finalPoint.lower, outcome.decimals)}–${formatNumber(finalPoint.upper, outcome.decimals)} ${outcome.unit})` : `Forecast unavailable: ${outcome.limitation}`,
        `Outlook: ${stateLabel(outcome.state)}; confidence: ${outcome.confidence}`,
        `Configured action: ${outcome.action}`,
        'Using the DCCS context and recent operational notes, challenge this recommendation. Give a BLUF, the strongest evidence for and against it, the decision you recommend, and the next review trigger. Do not invent data or change the portal.'
      ].join('\n');
      assistant.open();
      assistant.els.input.value = prompt;
      assistant.autoSizeInput();
      assistant.updateSendButtonState();
      assistant.els.input.focus();
    },

    confirmDecisionRecord() {
      const state = this._decisionOutlookState;
      const outcome = state.outlook.outcomes.find(item => item.id === state.selectedId);
      const owner = document.getElementById('outlook-owner')?.value.trim();
      const reviewDate = isoDate(document.getElementById('outlook-review-date')?.value);
      const rationale = document.getElementById('outlook-rationale')?.value.trim();
      const course = document.getElementById('outlook-course')?.value || 'recommended';
      const status = document.getElementById('outlook-save-status');
      if (!outcome || !outcome.decisionEligible || !owner || !reviewDate || !rationale) {
        if (status) status.textContent = 'Owner, review date, and rationale are required.';
        return;
      }
      const courseLabels = { recommended: 'Recommended action', monitor: 'Monitor through the next cycle', 'collect-evidence': 'Collect more evidence first' };
      this.confirmAction({
        title: 'Record DCCS decision?',
        message: 'This adds a shared decision record. It will not change metrics, tasks, KPI checks, or dialogue.',
        confirmLabel: 'Record decision',
        details: [
          { label: 'Outcome', value: `${outcome.service} — ${outcome.name}` },
          { label: 'Course', value: courseLabels[course] },
          { label: 'Owner', value: owner },
          { label: 'Review', value: reviewDate }
        ]
      }, () => this.persistDecisionRecord({ outcome, owner, reviewDate, rationale, course, courseLabel: courseLabels[course] }));
    },

    async persistDecisionRecord({ outcome, owner, reviewDate, rationale, course, courseLabel }) {
      const status = document.getElementById('outlook-save-status');
      try {
        if (!outcome || !outcome.decisionEligible) throw new Error('This KPI is report-only and cannot create a decision.');
        const sync = syncClient();
        if (!sync || !sync.enabled || !sync.db) throw new Error('Firestore is not connected.');
        const now = new Date().toISOString();
        const payload = {
          createdAt: root.firebase && firebase.firestore && firebase.firestore.FieldValue ? firebase.firestore.FieldValue.serverTimestamp() : now,
          createdAtISO: now,
          createdBy: typeof this.getCurrentUser === 'function' ? this.getCurrentUser() : 'DCCS',
          serviceLineId: outcome.serviceLineId,
          service: outcome.service,
          outcomeId: outcome.id,
          outcomeName: outcome.name,
          metricIds: Array.from(new Set([...outcome.sourceMetricIds, ...outcome.supportIds])),
          forecastSnapshot: outlookSnapshot(outcome),
          selectedCourse: course,
          selectedCourseLabel: courseLabel,
          action: course === 'recommended' ? outcome.action : courseLabel,
          rationale,
          owner,
          reviewDate,
          status: 'open',
          outcome: '',
          outcomeAt: null,
          supersedesDecisionId: this._decisionOutlookState.supersedesId || null
        };
        const ref = await sync.db.collection('dccs_data').doc('decisions').collection('entries').add(payload);
        if (payload.supersedesDecisionId) {
          await sync.db.collection('dccs_data').doc('decisions').collection('entries').doc(payload.supersedesDecisionId).update({
            status: 'superseded',
            supersededByDecisionId: ref.id,
            updatedAt: root.firebase && firebase.firestore && firebase.firestore.FieldValue ? firebase.firestore.FieldValue.serverTimestamp() : now
          });
        }
        if (typeof this.logAudit === 'function') this.logAudit('record_decision', ref.id, '', `${outcome.service}: ${outcome.name}; owner ${owner}; review ${reviewDate}`);
        this._decisionOutlookState.supersedesId = null;
        this._decisionOutlookState.status = 'Decision recorded. Existing metric and task data were not changed.';
        if (status) status.textContent = this._decisionOutlookState.status;
      } catch (error) {
        this._decisionOutlookState.status = `Decision not saved: ${error.message || 'unknown error'}`;
        if (status) status.textContent = this._decisionOutlookState.status;
      }
    },

    subscribeDecisionLog() {
      if (this._decisionOutlookUnsubscribe) this._decisionOutlookUnsubscribe();
      const sync = syncClient();
      if (!sync || !sync.db || !this._decisionOutlookActive) return;
      this._decisionOutlookUnsubscribe = sync.db.collection('dccs_data').doc('decisions').collection('entries')
        .orderBy('createdAt', 'desc').limit(25).onSnapshot(snapshot => {
          this._decisionOutlookState.decisions = snapshot.docs.map(doc => {
            const data = doc.data() || {};
            return { id: doc.id, ...data };
          });
          const log = document.getElementById('outlook-decision-log');
          if (log && this._decisionOutlookActive) {
            log.innerHTML = this.renderDecisionLog();
            this.bindDecisionLogEvents(document.getElementById('app'));
          }
        }, error => {
          const log = document.getElementById('outlook-decision-log');
          if (log) log.innerHTML = `<div class="outlook-log-empty">Decision log unavailable: ${escapeHtml(error.message || 'connection error')}</div>`;
        });
    },

    confirmDecisionReview(decisionId) {
      const container = document.querySelector(`[data-decision-id="${decisionId}"]`);
      if (!container) return;
      const statusValue = container.querySelector('[data-review-status]')?.value || 'reviewed';
      const outcome = container.querySelector('[data-review-outcome]')?.value.trim() || '';
      this.confirmAction({
        title: 'Save decision review?',
        message: 'This updates only the selected decision record.',
        confirmLabel: 'Save review',
        details: [{ label: 'Status', value: statusValue }, { label: 'Outcome', value: outcome || 'No outcome note' }]
      }, () => this.persistDecisionReview(decisionId, statusValue, outcome));
    },

    async persistDecisionReview(decisionId, statusValue, outcome) {
      try {
        const sync = syncClient();
        if (!sync || !sync.enabled || !sync.db) throw new Error('Firestore is not connected.');
        const now = new Date().toISOString();
        await sync.db.collection('dccs_data').doc('decisions').collection('entries').doc(decisionId).update({
          status: statusValue,
          outcome,
          outcomeAt: root.firebase && firebase.firestore && firebase.firestore.FieldValue ? firebase.firestore.FieldValue.serverTimestamp() : now,
          updatedBy: typeof this.getCurrentUser === 'function' ? this.getCurrentUser() : 'DCCS'
        });
        if (typeof this.logAudit === 'function') this.logAudit('review_decision', decisionId, '', `${statusValue}: ${outcome}`);
      } catch (error) {
        this._decisionOutlookState.status = `Decision review not saved: ${error.message || 'unknown error'}`;
      }
    },

    prepareSupersedingDecision(decisionId) {
      const decision = this._decisionOutlookState.decisions.find(item => item.id === decisionId);
      if (!decision) return;
      const matching = this._decisionOutlookState.outlook.outcomes.find(item => item.id === decision.outcomeId);
      if (!matching || !matching.decisionEligible) return;
      this._decisionOutlookState.selectedId = matching.id;
      this._decisionOutlookState.supersedesId = decisionId;
      const main = document.getElementById('app');
      this.renderDecisionOutlook(main);
      document.getElementById('outlook-inspector')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },

    refreshDecisionOutlook() {
      if (!this._decisionOutlookActive || location.hash !== '#/dashboard') return;
      const rootEl = document.getElementById('decision-outlook');
      const active = document.activeElement;
      if (rootEl && active && rootEl.contains(active) && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)) {
        this._decisionOutlookPendingRefresh = true;
        return;
      }
      if (this._decisionOutlookRefreshTimer) clearTimeout(this._decisionOutlookRefreshTimer);
      this._decisionOutlookRefreshTimer = setTimeout(() => {
        if (this._decisionOutlookActive && location.hash === '#/dashboard') this.renderDecisionOutlook(document.getElementById('app'));
      }, 80);
    }
  });

  root.addEventListener('hashchange', () => {
    if (location.hash !== '#/dashboard' && root.App && typeof root.App.destroyDecisionOutlook === 'function') {
      root.App.destroyDecisionOutlook();
    }
  });
}(typeof window !== 'undefined' ? window : null));
