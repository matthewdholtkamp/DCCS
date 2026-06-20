// Executive Summary (EXSUM) — clinical-operations briefing slide with published campaign snapshots.
(function () {
  window.App = window.App || {};

  const EXSUM_START = '2025-08-01';
  const EXSUM_END = '2027-08-01';
  const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const STATUS_COLORS = { green: '#3fa45b', amber: '#e0a23d', red: '#d2433a', black: '#1d1f23', grey: '#8a8f98' };
  const SERVICE_COLORS = {
    pcsl: '#3f86bc',
    surgery: '#7047b8',
    'mental-health': '#5f7454',
    emergency: '#bd4f47',
    mscoe: '#b77d00'
  };
  const SERVICE_CARD_GROUPS = [
    { label: 'PCSL', start: 0, count: 2 },
    { label: 'Surgery', start: 2, count: 1 },
    { label: 'Mental Health', start: 3, count: 1 },
    { label: 'Emergency', start: 4, count: 2 },
    { label: 'MSCoE', start: 6, count: 2 }
  ];
  const ACCESS_CAMPAIGN = [
    {
      id: 'pcsl', service: 'PCSL', owner: 'MAJ Tobin', outcome: 'Acute <24h · Follow-up <7d', date: 'Sustain after 10 Aug 2026',
      actionLabel: 'Flex trigger', action: '>2d acute or >10d follow-up for 1–2 wks → expand medic clinic, sick call, and nurse-lead encounters.'
    },
    {
      id: 'emergency', service: 'Emergency', owner: 'MAJ Henderson', outcome: 'LWOBS <1%', date: 'Sustain after 10 Aug 2026',
      actionLabel: 'PI action', action: 'Run the ER flow and efficiency PI project; review its new KPIs weekly.'
    },
    {
      id: 'mental-health', service: 'Mental Health', owner: 'Dr Fellwock', outcome: '<6 off-post AD referrals / month', date: 'Sustain after 10 Aug 2026',
      actionLabel: 'Leading indicator', action: 'High-utilizer metric becomes a DCCS accountability signal by 1 Jul 2026.'
    },
    {
      id: 'surgery', service: 'Surgery', owner: 'LTC Weir', outcome: '20 surgeries / week sustained', date: '10 Aug 2026',
      actionLabel: 'Advance', action: 'Scale to 40 surgeries / week by Jul 2027.'
    }
  ];
  const PHASE_FALLBACKS = [
    { start: '2025-08-01', end: '2026-03-01' },
    { start: '2026-03-01', end: '2026-08-10' },
    { start: '2026-08-10', end: '2027-07-01' }
  ];

  function exLatest(entries) {
    return entries && entries.length ? entries[entries.length - 1] : null;
  }

  function exPrev(entries) {
    return entries && entries.length > 1 ? entries[entries.length - 2] : null;
  }

  function exDaysAgoISO(endISO, n) {
    const date = new Date(`${String(endISO).slice(0, 10)}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - n);
    return date.toISOString().slice(0, 10);
  }

  // Reporting windows deliberately anchor to the newest reported date, not today.
  // That keeps a quiet weekend or reporting gap from blanking a seven-day card.
  function exWindow(entries, days, endISO) {
    const end = endISO || (exLatest(entries) && exLatest(entries).date);
    if (!end) return [];
    const start = exDaysAgoISO(end, days - 1);
    return entries.filter(entry => entry.date >= start && entry.date <= end);
  }

  function exSum(entries) {
    return entries.reduce((sum, entry) => sum + (Number(entry.value) || 0), 0);
  }

  function exAvg(entries) {
    return entries.length ? exSum(entries) / entries.length : null;
  }

  function exMonthBucket(entries, month) {
    return exSum(entries.filter(entry => String(entry.date).slice(0, 7) === month));
  }

  function exMonthShift(month, offset) {
    const parts = String(month).split('-').map(Number);
    const date = new Date(Date.UTC(parts[0], parts[1] - 1 + offset, 1));
    return date.toISOString().slice(0, 7);
  }

  function exNumber(value, decimals) {
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(decimals) : '—';
  }

  function exDisplay(value, decimals) {
    return value === null || value === undefined || !Number.isFinite(Number(value)) ? '—' : exNumber(value, decimals);
  }

  function exEsc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  }

  function exTone(value, kind) {
    if (!Number.isFinite(Number(value))) return 'grey';
    const number = Number(value);
    if (kind === 'acute') return number < 24 ? 'green' : number <= 48 ? 'amber' : 'red';
    if (kind === 'followup') return number < 7 ? 'green' : number <= 10 ? 'amber' : 'red';
    if (kind === 'surgery') return number >= 40 ? 'green' : number >= 20 ? 'amber' : number >= 10 ? 'red' : 'black';
    if (kind === 'referrals') return number < 6 ? 'green' : number <= 15 ? 'amber' : 'red';
    if (kind === 'lwobs') return number < 1 ? 'green' : number <= 2 ? 'amber' : 'red';
    if (kind === 'trainees') return number < 10 ? 'green' : number <= 15 ? 'amber' : 'red';
    if (kind === 'acuity') return number < 4 ? 'green' : number <= 7 ? 'amber' : 'red';
    return 'grey';
  }

  function exTrend(current, previous, betterDirection) {
    if (!Number.isFinite(Number(current)) || !Number.isFinite(Number(previous))) return { arrow: '—', tone: 'grey', delta: null };
    const delta = Number(current) - Number(previous);
    if (delta === 0) return { arrow: '—', tone: 'grey', delta: 0 };
    const direction = delta > 0 ? '▲' : '▼';
    const favorable = betterDirection === 'higher' ? delta > 0 : betterDirection === 'lower' ? delta < 0 : null;
    return { arrow: direction, tone: favorable === null ? 'grey' : favorable ? 'green' : 'red', delta };
  }

  function exMonthLabel(month) {
    const [year, monthNumber] = month.split('-').map(Number);
    return `${MONTH_NAMES[monthNumber - 1]} ${year}`;
  }

  function exByDate(entries) {
    const map = {};
    (entries || []).forEach(e => { const d = String(e.date).slice(0, 10); map[d] = (map[d] || 0) + (Number(e.value) || 0); });
    return map;
  }

  function exTailValues(entries, n) {
    return (entries || []).slice(-n).map(e => Number(e.value)).filter(Number.isFinite);
  }

  function exMonthlySeries(entries, endMonth, n) {
    const out = [];
    for (let i = n - 1; i >= 0; i--) out.push(exMonthBucket(entries, exMonthShift(endMonth, -i)));
    return out;
  }

  function exDailyRatioSeries(numEntries, denEntries, n) {
    const num = exByDate(numEntries), den = exByDate(denEntries);
    return Object.keys(den).sort().slice(-n).map(d => den[d] ? (num[d] || 0) / den[d] * 100 : 0);
  }

  function exSparkline(values, stroke, fill) {
    const pts = (values || []).map(Number).filter(Number.isFinite);
    if (pts.length < 2) return '';
    const w = 100, h = 30, min = Math.min(...pts), max = Math.max(...pts), range = (max - min) || 1, step = w / (pts.length - 1);
    const d = pts.map((v, i) => (i ? 'L' : 'M') + (i * step).toFixed(1) + ',' + (h - ((v - min) / range) * h).toFixed(1)).join(' ');
    const endX = ((pts.length - 1) * step).toFixed(1);
    const endY = (h - ((pts[pts.length - 1] - min) / range) * h).toFixed(1);
    return '<svg class="exsum-spark" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" aria-hidden="true"><path d="' + d + ' L' + w + ',' + h + ' L0,' + h + ' Z" fill="' + fill + '"/><path d="' + d + '" fill="none" stroke="' + stroke + '" stroke-width="1.6" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/><circle cx="' + endX + '" cy="' + endY + '" r="2.2" fill="' + stroke + '" vector-effect="non-scaling-stroke"/></svg>';
  }

  function exCard(card) {
    const trend = exTrend(card.value, card.previous, card.betterDirection);
    const deltaPrecision = trend.delta && Number(exNumber(trend.delta, card.decimals)) === 0 ? Math.max(1, card.decimals) : card.decimals;
    const delta = trend.delta === null || trend.delta === 0 ? '' : (trend.delta > 0 ? '+' : '') + exNumber(trend.delta, deltaPrecision);
    const sparkStroke = card.reference ? '#5aa9e6' : STATUS_COLORS[card.tone] || STATUS_COLORS.grey;
    const sparkFill = card.reference ? 'rgba(90,169,230,.14)' : card.tone === 'black' ? 'rgba(29,31,35,.10)' : card.tone === 'grey' ? 'rgba(138,143,152,.10)' : card.tone === 'green' ? 'rgba(63,164,91,.12)' : card.tone === 'amber' ? 'rgba(224,162,61,.14)' : 'rgba(210,67,58,.11)';
    return '' +
      '<article class="exsum-card tone-' + card.tone + (card.reference ? ' is-reference' : '') + '">' +
        '<div class="exsum-card-label">' + exEsc(card.label) + '</div>' +
        '<div class="exsum-card-value">' + exDisplay(card.value, card.decimals) + (card.unit ? '<span class="exsum-unit">' + exEsc(card.unit) + '</span>' : '') + '</div>' +
        '<div class="exsum-card-trend trend-' + trend.tone + '"><span class="exsum-arrow">' + trend.arrow + '</span><span>' + (delta || 'no prior') + '</span><span class="exsum-card-target">' + exEsc(card.target) + '</span></div>' +
        '<div class="exsum-card-spark">' + exSparkline(card.series, sparkStroke, sparkFill) + '</div>' +
        '<div class="exsum-card-caption">' + exEsc(card.caption) + '</div>' +
      '</article>';
  }

  function exGroupedCards(cards) {
    return SERVICE_CARD_GROUPS.map(group =>
      '<section class="exsum-service-group" aria-label="' + exEsc(group.label) + ' metrics" style="--group-span:' + group.count + '">' +
        '<span class="exsum-service-label">' + exEsc(group.label) + '</span>' +
        cards.slice(group.start, group.start + group.count).map(exCard).join('') +
      '</section>'
    ).join('');
  }

  function exCards(app) {
    const get = id => app.getMetricEntries(id) || [];
    const currentMonth = new Date().toISOString().slice(0, 7);
    const SPARK_N = 14;
    const specs = [
      { label: 'PCSL Acute', unit: 'hrs', metric: 'pcsl-acute', mode: 'latest', decimals: 1, kind: 'acute', dir: 'lower', target: '<24h', caption: 'latest reported' },
      { label: 'PCSL Follow-up', unit: 'days', metric: 'pcsl-followup', mode: 'latest', decimals: 1, kind: 'followup', dir: 'lower', target: '<7d', caption: 'latest reported' },
      { label: 'Total Surgeries', unit: '', metric: 'surgery-total', mode: 'latest', decimals: 0, kind: 'surgery', dir: 'higher', target: '≥40/wk', caption: 'vs prior week' },
      { label: 'MH Referrals Off-Post', unit: '', metric: 'mh-active-duty-off-post', mode: 'month', decimals: 0, kind: 'referrals', dir: 'lower', target: '<6/mo', caption: exMonthLabel(currentMonth) },
      { label: 'ER LWOBS', unit: '%', mode: 'ratio', num: 'er-lwobs', den: 'er-total-census', decimals: 1, kind: 'lwobs', dir: 'lower', target: '<1%', caption: 'latest 7 days' },
      { label: 'ER Avg Census', unit: '', metric: 'er-total-census', mode: 'window7', decimals: 0, kind: 'informational', dir: null, target: 'Monitor', caption: 'latest 7 days', reference: true },
      { label: 'Trainees/day in ER', unit: '', metric: 'er-total-trainees', mode: 'window7', decimals: 0, kind: 'trainees', dir: 'lower', target: '<10/day', caption: 'latest 7 days' },
      { label: 'Cat 4/5 Trainees/day', unit: '', metric: 'er-esi-4-5', mode: 'window7', decimals: 1, kind: 'acuity', dir: 'lower', target: '<4/day', caption: 'latest 7 days' }
    ];

    return specs.map(spec => {
      let value = null, previous = null, series = [];
      if (spec.mode === 'latest') {
        const rows = get(spec.metric);
        const latest = exLatest(rows), prev = exPrev(rows);
        value = latest ? latest.value : null;
        previous = prev ? prev.value : null;
        series = exTailValues(rows, SPARK_N);
      } else if (spec.mode === 'month') {
        const rows = get(spec.metric);
        value = exMonthBucket(rows, currentMonth);
        previous = exMonthBucket(rows, exMonthShift(currentMonth, -1));
        series = exMonthlySeries(rows, currentMonth, 12);
      } else if (spec.mode === 'window7') {
        const rows = get(spec.metric);
        const latest = exLatest(rows);
        const end = latest && latest.date;
        value = end ? exAvg(exWindow(rows, 7, end)) : null;
        previous = end ? exAvg(exWindow(rows, 7, exDaysAgoISO(end, 7))) : null;
        series = exTailValues(rows, SPARK_N);
      } else if (spec.mode === 'ratio') {
        const num = get(spec.num), den = get(spec.den);
        const end = (exLatest(den) && exLatest(den).date) || (exLatest(num) && exLatest(num).date);
        const ratioAt = e => { if (!e) return null; const d = exSum(exWindow(den, 7, e)); return d ? exSum(exWindow(num, 7, e)) / d * 100 : null; };
        value = ratioAt(end);
        previous = ratioAt(end && exDaysAgoISO(end, 7));
        series = exDailyRatioSeries(num, den, SPARK_N);
      }
      const numericValue = Number.isFinite(Number(value)) ? Number(value) : null;
      const numericPrev = Number.isFinite(Number(previous)) ? Number(previous) : null;
      return {
        label: spec.label, value: numericValue, previous: numericPrev, decimals: spec.decimals, unit: spec.unit || '', target: spec.target, reference: !!spec.reference,
        tone: exTone(numericValue, spec.kind), betterDirection: spec.dir, caption: spec.caption, series
      };
    });
  }

  function exToday() {
    const d = new Date();
    return d.getDate() + ' ' + MONTH_NAMES[d.getMonth()] + ' ' + d.getFullYear();
  }

  function exTotalKpiUniverse(app) {
    let total = 0;
    const countTask = task => {
      const saved = app.getTaskData(task.id) || {};
      const deleted = saved.deletedKpis || {};
      const builtin = (task.kpis || []).filter((k, i) => !deleted[i]).length;
      return builtin + ((saved.customKpis || []).length);
    };
    (FRAMEWORK.serviceLines || []).forEach(sl => (sl.tasks || []).forEach(t => { total += countTask(t); }));
    (FRAMEWORK.crossCuttingTasks || []).forEach(t => { total += countTask(t); });
    return total;
  }

  function exCompletedDates(app, task) {
    const saved = app.getTaskData(task.id) || {};
    const checks = saved.kpis || {};
    const dates = saved.kpiDates || {};
    const deleted = saved.deletedKpis || {};
    const completed = [];
    (task.kpis || []).forEach((kpi, index) => {
      if (!deleted[index] && checks[index] === true && dates[index]) completed.push(String(dates[index]).slice(0, 10));
    });
    (saved.customKpis || []).forEach((kpi, index) => {
      const key = `custom-${index}`;
      if (checks[key] === true && dates[key]) completed.push(String(dates[key]).slice(0, 10));
    });
    return completed;
  }

  function exMonths() {
    const months = [];
    let month = EXSUM_START;
    while (month <= EXSUM_END) {
      months.push(month);
      month = exMonthShift(month.slice(0, 7), 1) + '-01';
    }
    return months;
  }

  function exCumulativeSeries(dates, months) {
    const sorted = dates.slice().sort();
    const cutoff = new Date().toISOString().slice(0, 7);
    let cursor = 0;
    return months.map(month => {
      if (month.slice(0, 7) > cutoff) return null;
      while (cursor < sorted.length && sorted[cursor] <= month) cursor++;
      return cursor;
    });
  }

  function exChartData(app) {
    const months = exMonths();
    const lines = (FRAMEWORK.serviceLines || []).map(serviceLine => {
      const dates = (serviceLine.tasks || []).flatMap(task => exCompletedDates(app, task));
      return {
        label: serviceLine.name,
        borderColor: SERVICE_COLORS[serviceLine.id] || '#8a8f98',
        backgroundColor: SERVICE_COLORS[serviceLine.id] || '#8a8f98',
        data: exCumulativeSeries(dates, months),
        borderWidth: 1.5,
        pointRadius: 0,
        pointHoverRadius: 3,
        stepped: true,
        tension: 0,
        fill: false,
        order: 1
      };
    });
    const totalDates = (FRAMEWORK.serviceLines || []).flatMap(serviceLine =>
      (serviceLine.tasks || []).flatMap(task => exCompletedDates(app, task))
    ).concat((FRAMEWORK.crossCuttingTasks || []).flatMap(task => exCompletedDates(app, task)));
    lines.push({
      label: 'Total', borderColor: '#1d1f23', backgroundColor: 'rgba(29,31,35,.10)', data: exCumulativeSeries(totalDates, months),
      borderWidth: 3, pointRadius: 0, pointHoverRadius: 3, stepped: true, tension: 0, fill: 'origin', order: -1
    });
    return { months, lines };
  }

  function exParseDate(value) {
    const text = String(value || '');
    const iso = /\b(\d{4}-\d{2}-\d{2})\b/.exec(text);
    if (iso) return iso[1];
    const named = /\b(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{4})\b/i.exec(text);
    if (!named) return null;
    const month = MONTH_NAMES.findIndex(name => name.toLowerCase() === named[2].slice(0, 3).toLowerCase()) + 1;
    return `${named[3]}-${String(month).padStart(2, '0')}-${String(named[1]).padStart(2, '0')}`;
  }

  function exPhaseBand(phase, index) {
    const text = Array.isArray(phase.dateRange) ? phase.dateRange.join(' ') : phase.dateRange;
    const matches = String(text || '').match(/\d{4}-\d{2}-\d{2}|\d{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4}/gi) || [];
    const fallback = PHASE_FALLBACKS[index] || { start: EXSUM_START, end: EXSUM_END };
    let start = fallback.start;
    let end = fallback.end;
    if (matches.length > 1) {
      start = exParseDate(matches[0]) || start;
      end = exParseDate(matches[1]) || end;
    } else if (matches.length === 1) {
      // Some framework date ranges omit the repeated year (for example "1 Mar – 10 Aug 2026").
      if (String(text).trim().startsWith(matches[0])) start = exParseDate(matches[0]) || start;
      else end = exParseDate(matches[0]) || end;
    }
    return { label: phase.name || `Phase ${index + 1}`, start, end, status: phase.status };
  }

  const exsumPhaseBands = {
    id: 'exsumPhaseBands',
    beforeDatasetsDraw(chart, args, options) {
      const x = chart.scales.x;
      const area = chart.chartArea;
      if (!x || !area || !options.bands || !options.months) return;
      const startMs = Date.parse(EXSUM_START);
      const endMs = Date.parse(EXSUM_END);
      const xAt = date => {
        const fraction = (Date.parse(date) - startMs) / (endMs - startMs);
        return x.getPixelForValue(0) + (x.getPixelForValue(options.months.length - 1) - x.getPixelForValue(0)) * fraction;
      };
      const context = chart.ctx;
      context.save();
      options.bands.forEach((band, index) => {
        const left = Math.max(area.left, xAt(band.start));
        const right = Math.min(area.right, xAt(band.end));
        if (right <= left) return;
        context.fillStyle = band.status === 'active' ? 'rgba(255,184,28,.14)' : index === 0 ? 'rgba(90,169,230,.065)' : 'rgba(29,31,35,.035)';
        context.fillRect(left, area.top, right - left, area.bottom - area.top);
      });
      context.restore();
    },
    afterDatasetsDraw(chart, args, options) {
      const x = chart.scales.x;
      const area = chart.chartArea;
      if (!x || !area || !options.bands || !options.months) return;
      const startMs = Date.parse(EXSUM_START);
      const endMs = Date.parse(EXSUM_END);
      const xAt = date => {
        const fraction = (Date.parse(date) - startMs) / (endMs - startMs);
        return x.getPixelForValue(0) + (x.getPixelForValue(options.months.length - 1) - x.getPixelForValue(0)) * fraction;
      };
      const context = chart.ctx;
      context.save();
      context.font = '700 9px system-ui, sans-serif';
      context.textAlign = 'center';
      options.bands.forEach(band => {
        const left = Math.max(area.left, xAt(band.start));
        const right = Math.min(area.right, xAt(band.end));
        if (right <= left) return;
        context.fillStyle = band.status === 'active' ? '#a97000' : '#7b8189';
        context.fillText(String(band.label).replace(/^Phase\s*\d+\s*[—-]?\s*/i, '').toUpperCase(), left + (right - left) / 2, area.top + 13);
      });
      context.restore();
    }
  };

  function exSummary(cards) {
    const active = (FRAMEWORK.phases || []).find(phase => phase.status === 'active') || FRAMEWORK.currentPhase || {};
    const mainEffort = active.mainEffort || 'LOE 1 — Medically Ready Force';
    const acute = exDisplay(cards[0].value, 1);
    const followup = exDisplay(cards[1].value, 1);
    const surgery = exDisplay(cards[2].value, 0);
    const lwobs = exDisplay(cards[4].value, 1);
    return `Current main effort: ${mainEffort} — drive DHA access and throughput during ${active.name || 'the active phase'}. Acute access at ${acute}h and follow-ups at ${followup}d against the <24h/<7d standard, surgical volume ${surgery}/wk, and ER LWOBS ${lwobs}%.`;
  }

  function exCampaignMeta(brief) {
    const generatedAt = brief && brief.generatedAt && new Date(brief.generatedAt);
    if (!generatedAt || Number.isNaN(generatedAt.getTime())) return { text: 'No weekly brief published', stale: false };
    const stamp = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
    }).format(generatedAt).replace(',', '');
    const stale = Date.now() - generatedAt.getTime() > 35 * 24 * 60 * 60 * 1000;
    return { text: `${stale ? 'Stale · ' : ''}Updated ${stamp} CT`, stale };
  }

  function exCampaignLiveUpdate(lane, brief) {
    const live = brief && brief.lanes && brief.lanes[lane.id];
    if (!live || !live.progress || !live.evidence || !live.update) {
      return '<div class="exsum-lane-progress is-pending"><span>Progress</span><strong>Pending</strong><em>Monthly brief</em></div>' +
        '<p class="exsum-lane-update is-pending">No monthly update published yet. Generate it from the Weekly Rollup.</p>';
    }
    const tone = String(live.progress).toLowerCase().replace(/\s+/g, '-');
    return '<div class="exsum-lane-progress tone-' + exEsc(tone) + '"><span>Progress</span><strong>' + exEsc(live.progress) + '</strong><em>' + exEsc(live.evidence) + '</em></div>' +
      '<p class="exsum-lane-update">' + exEsc(live.update) + '</p>';
  }

  function exCampaign(brief) {
    return ACCESS_CAMPAIGN.map(lane => `
      <article class="exsum-campaign-lane">
        <div class="exsum-lane-head"><strong>${exEsc(lane.service)}</strong><span>${exEsc(lane.owner)}</span></div>
        <div class="exsum-lane-outcome">${exEsc(lane.outcome)}</div>
        <div class="exsum-lane-date">${exEsc(lane.date)}</div>
        <p class="exsum-lane-action"><span>${exEsc(lane.actionLabel)}</span>${exEsc(lane.action)}</p>
        ${exCampaignLiveUpdate(lane, brief)}
      </article>`).join('');
  }

  function exPatchCampaign(root, brief) {
    if (!root || !root.isConnected) return;
    const lanes = root.querySelector('.exsum-campaign-lanes');
    if (lanes) lanes.innerHTML = exCampaign(brief);
    const meta = exCampaignMeta(brief);
    root.querySelectorAll('[data-exsum-campaign-stamp]').forEach(element => {
      element.textContent = meta.text;
      element.classList.toggle('is-stale', meta.stale);
    });
  }

  Object.assign(window.App, {
    setCampaignBriefStatus(root, message, state) {
      if (!root || !root.isConnected) return;
      const element = root.querySelector('[data-exsum-campaign-status]');
      if (!element) return;
      element.textContent = message;
      element.classList.toggle('is-error', state === 'error');
      element.classList.toggle('is-running', state === 'running');
    },

    subscribeCampaignBrief(root) {
      if (this._exsumCampaignUnsubscribe) {
        this._exsumCampaignUnsubscribe();
        this._exsumCampaignUnsubscribe = null;
      }
      if (this._exsumCampaignSubscribeTimer) clearTimeout(this._exsumCampaignSubscribeTimer);
      const subscribe = () => {
        if (root !== this._exsumRoot || !root.isConnected) return;
        if (typeof Sync === 'undefined' || !Sync.db) {
          this._exsumCampaignSubscribeTimer = setTimeout(subscribe, 300);
          return;
        }
        const reference = Sync.db.collection('dccs_data').doc('campaign_briefs').collection('snapshots').doc('current');
        this._exsumCampaignUnsubscribe = reference.onSnapshot(snapshot => {
          this._exsumCampaignBrief = snapshot.exists ? snapshot.data() : null;
          exPatchCampaign(root, this._exsumCampaignBrief);
        }, () => {
          this.setCampaignBriefStatus(root, 'Campaign brief source is unavailable. The current view remains unchanged.', 'error');
        });
      };
      subscribe();
    },

    renderDashboard(el) {
      this.injectDashboardStyles();
      this._exsumRoot = null;
      if (this._exsumChart) {
        this._exsumChart.destroy();
        this._exsumChart = null;
      }

      const cards = exCards(this);
      const chartData = exChartData(this);
      const exsumKpiUniverse = exTotalKpiUniverse(this);
      const totalLine = chartData.lines.find(line => line.label === 'Total');
      const completedKpis = ((totalLine && totalLine.data) || []).filter(value => Number.isFinite(value)).pop() || 0;
      const exsumKpiMax = Math.max(1, Math.ceil(completedKpis / 0.75));
      el.innerHTML = `
        <section class="exsum-root" aria-label="Executive Summary clinical operations briefing">
          <header class="exsum-top">
            <div class="exsum-title-row"><h1 class="exsum-title">DCCS — Executive Summary</h1><span class="exsum-asof">As of ${exEsc(exToday())}</span></div>
            <p class="exsum-desired"><span class="exsum-desired-tag">Desired State</span> ${exEsc(FRAMEWORK.desiredState || '')}</p>
          </header>
          <div class="exsum-access-context"><span>Access to Care</span><strong>Primary Outcome</strong></div>
          <section class="exsum-cards" aria-label="Clinical operations status">${exGroupedCards(cards)}</section>
          <section class="exsum-lower">
            <div class="exsum-left">
              <div class="exsum-chart-shell"><div class="exsum-chart-heading"><span class="exsum-chart-title">KPI Completion Progress <em>full campaign · through Jul 2027</em></span><strong class="exsum-chart-progress">${completedKpis} / ${exsumKpiUniverse} complete</strong></div><canvas id="exsum-kpi-chart" aria-label="Cumulative completed KPI chart"></canvas></div>
              <div class="exsum-readout"><span>Access to Care Readout</span><p>${exEsc(exSummary(cards))}</p></div>
            </div>
            <aside class="exsum-campaign" aria-label="Access-to-care campaign">
              <div class="exsum-campaign-heading">Access-to-Care Campaign <span>Monthly Access Review</span></div>
              <div class="exsum-campaign-lanes">${exCampaign(this._exsumCampaignBrief)}</div>
            </aside>
          </section>
          <div class="exsum-campaign-control" aria-live="polite">
            <span class="exsum-campaign-stamp" data-exsum-campaign-stamp>${exEsc(exCampaignMeta(this._exsumCampaignBrief).text)}</span>
            <span class="exsum-campaign-status" data-exsum-campaign-status>Monthly access brief · live snapshot from the Rollup</span>
          </div>
          <footer class="exsum-classification">UNCLASSIFIED</footer>
        </section>`;

      this._exsumRoot = el.querySelector('.exsum-root');
      this.subscribeCampaignBrief(this._exsumRoot);

      const canvas = el.querySelector('#exsum-kpi-chart');
      if (!canvas || typeof Chart === 'undefined') return;
      const bands = (FRAMEWORK.phases || []).map(exPhaseBand);
      this._exsumChart = new Chart(canvas, {
        type: 'line',
        data: { labels: chartData.months, datasets: chartData.lines },
        plugins: [exsumPhaseBands],
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          interaction: { mode: 'index', intersect: false },
          layout: { padding: { top: 4, right: 8, bottom: 0, left: 2 } },
          plugins: {
            legend: { display: true, position: 'bottom', labels: { color: '#41464d', boxWidth: 10, boxHeight: 2, padding: 10, font: { size: 10, weight: '600' } } },
            tooltip: { backgroundColor: '#1d1f23', titleColor: '#ffffff', bodyColor: '#f2f3f4', borderColor: 'rgba(29,31,35,.28)', borderWidth: 1 },
            exsumPhaseBands: { bands, months: chartData.months }
          },
          scales: {
            x: { grid: { color: 'rgba(29,31,35,.07)' }, border: { color: '#d9dde1' }, ticks: { color: '#646b73', autoSkip: true, maxTicksLimit: 8, font: { size: 9 }, callback(value) { const date = this.getLabelForValue(value); const parts = date.split('-'); return `${MONTH_NAMES[Number(parts[1]) - 1]} ’${parts[0].slice(2)}`; } } },
            y: { beginAtZero: true, max: exsumKpiMax, ticks: { precision: 0, color: '#646b73', font: { size: 9 } }, grid: { color: 'rgba(29,31,35,.09)' }, border: { color: '#d9dde1' } }
          }
        }
      });
    },

    injectDashboardStyles() {
      if (document.getElementById('exsum-styles')) return;
      const style = document.createElement('style');
      style.id = 'exsum-styles';
      style.textContent = `
.nav-dashboard{padding:8px 16px;border-radius:8px;font-size:13px;font-weight:600;color:var(--text-secondary);cursor:pointer;transition:var(--transition);border:1px solid var(--border-subtle);background:transparent;font-family:inherit}
.nav-dashboard:hover{color:var(--gold);background:rgba(200,168,78,0.1);border-color:var(--border-accent)}
.nav-dashboard.active{color:var(--gold);background:rgba(200,168,78,0.15);border-color:var(--gold)}
.exsum-root,.exsum-root *{box-sizing:border-box}.exsum-root{height:calc(100vh - 64px);min-height:0;overflow:hidden;display:flex;flex-direction:column;gap:clamp(7px,1vh,12px);padding:clamp(8px,1.25vh,16px) clamp(10px,1.5vw,22px);color:var(--text-primary);background:var(--bg-primary,transparent);font-family:inherit}
.exsum-top{flex:none;display:flex;flex-direction:column;gap:clamp(4px,.6vh,7px);padding-bottom:clamp(6px,.8vh,10px);border-bottom:1px solid var(--border-subtle)}.exsum-title-row{position:relative;display:flex;align-items:center;justify-content:center}.exsum-title{margin:0;color:var(--text-primary);font-size:clamp(1.18rem,1.82vw,1.72rem);font-weight:850;letter-spacing:.045em;text-transform:uppercase}.exsum-asof{position:absolute;right:0;top:50%;transform:translateY(-50%);color:var(--text-muted);font-size:clamp(.58rem,.72vw,.78rem);font-weight:700}.exsum-desired{max-width:97%;margin:0 auto;text-align:center;color:var(--text-secondary);font-size:clamp(.72rem,.87vw,.94rem);line-height:1.34}.exsum-desired-tag{color:var(--gold);font-weight:800;letter-spacing:.1em;text-transform:uppercase;font-size:.84em;margin-right:7px}.exsum-campaign-control{flex:none;display:flex;align-items:center;gap:clamp(7px,.8vw,12px);min-height:21px;padding-top:3px;border-top:1px solid var(--border-subtle);font-size:clamp(.48rem,.58vw,.63rem);line-height:1.15}.exsum-campaign-stamp{color:#646b73;font-weight:750;white-space:nowrap}.exsum-campaign-stamp.is-stale{color:#b82e27}.exsum-campaign-status{min-width:0;flex:1 1 auto;overflow:hidden;color:#747b84;font-weight:600;text-overflow:ellipsis;white-space:nowrap}.exsum-campaign-status.is-running{color:#a97000}.exsum-campaign-status.is-error{color:#b82e27}.exsum-classification{flex:none;margin-top:clamp(1px,.3vh,4px);padding-top:clamp(3px,.5vh,6px);border-top:1px solid var(--border-subtle);text-align:center;color:#5fae6f;font-size:clamp(.6rem,.74vw,.8rem);font-weight:850;letter-spacing:.28em;text-transform:uppercase}
.exsum-access-context{flex:none;display:flex;align-items:center;gap:6px;min-height:10px;margin-bottom:-3px;color:#1d1f23;font-size:clamp(.52rem,.62vw,.67rem);font-weight:850;letter-spacing:.1em;line-height:1;text-transform:uppercase}.exsum-access-context span{color:#a97000}.exsum-access-context strong{font:inherit}.exsum-access-context strong:before{margin-right:6px;color:#8a8f98;content:'—'}
.exsum-cards{height:18%;min-height:99px;display:flex;gap:clamp(5px,.65vw,10px);overflow:visible}
.exsum-service-group{position:relative;min-width:0;min-height:0;flex:var(--group-span) 1 0;display:flex;gap:4px;padding:clamp(7px,.75vh,9px) 3px 3px;border:1px solid #1d1f23;border-radius:4px}.exsum-service-label{position:absolute;z-index:1;top:0;left:7px;transform:translateY(-50%);padding:0 4px;background:#fff;color:#1d1f23;font-size:clamp(.45rem,.53vw,.56rem);font-weight:850;letter-spacing:.12em;line-height:1.2;text-transform:uppercase}
.exsum-card{--card-accent:#8a8f98;--card-tint:rgba(138,143,152,.08);min-width:0;flex:1 1 0;display:flex;flex-direction:column;padding:clamp(5px,.6vw,8px);border:1px solid rgba(29,31,35,.10);border-left:3px solid var(--card-accent);border-radius:3px;overflow:hidden;color:#1d1f23;background:var(--card-tint)}
.exsum-card.tone-green{--card-accent:#3fa45b;--card-tint:rgba(63,164,91,.10)}.exsum-card.tone-amber{--card-accent:#c18217;--card-tint:rgba(224,162,61,.12)}.exsum-card.tone-red{--card-accent:#d2433a;--card-tint:rgba(210,67,58,.10)}.exsum-card.tone-black{--card-accent:#1d1f23;--card-tint:rgba(29,31,35,.07)}.exsum-card.tone-grey{--card-accent:#747b84;--card-tint:rgba(138,143,152,.09)}.exsum-card.is-reference{--card-accent:#2f6f9f;--card-tint:#eaf4fb}
.exsum-card-label{min-height:2.05em;color:#42474e;font-size:clamp(.5rem,.6vw,.65rem);font-weight:850;line-height:1.12;text-transform:uppercase;letter-spacing:.035em}.exsum-card-value{margin-top:1px;color:var(--card-accent);font-size:clamp(1.17rem,1.75vw,1.95rem);font-weight:850;line-height:1;letter-spacing:-.04em;white-space:nowrap;font-variant-numeric:tabular-nums;display:flex;align-items:baseline;gap:.12em}.exsum-unit{font-size:.46em;font-weight:800;opacity:.8;letter-spacing:0}
.exsum-card-trend{display:flex;align-items:center;gap:4px;min-width:0;min-height:1.1em;margin-top:2px;font-size:clamp(.49rem,.58vw,.63rem);font-weight:800;color:#747b84}.exsum-card-trend.trend-green{color:#25813e}.exsum-card-trend.trend-red{color:#b82e27}.exsum-card-trend.trend-grey{color:#747b84}.exsum-card.is-reference .exsum-card-trend{color:#2f6f9f}.exsum-arrow{font-size:.95em}.exsum-card-target{margin-left:auto;padding-left:3px;color:var(--card-accent);font-size:.92em;font-weight:850;white-space:nowrap}
.exsum-card-spark{flex:1 1 auto;min-height:12px;margin-top:clamp(2px,.35vh,4px);display:flex;align-items:flex-end}.exsum-spark{width:100%;height:100%;display:block}.exsum-card-caption{margin-top:2px;overflow:hidden;color:#646b73;font-size:clamp(.46rem,.53vw,.58rem);line-height:1.1;white-space:nowrap;text-overflow:ellipsis}
.exsum-lower{min-height:0;flex:1 1 auto;display:flex;gap:clamp(8px,1vw,16px);overflow:hidden}.exsum-left{min-width:0;min-height:0;flex:0 0 calc(58% - clamp(5px,.5vw,8px));display:flex;flex-direction:column;gap:clamp(7px,.9vh,11px);overflow:hidden}.exsum-chart-shell{min-height:0;flex:1 1 auto;display:grid;grid-template-rows:auto minmax(0,1fr);padding:clamp(8px,1vw,13px);border:1px solid #d9dde1;border-radius:7px;background:#fff;overflow:hidden}.exsum-chart-heading{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:4px;color:#1d1f23;font-size:clamp(.68rem,.82vw,.88rem);font-weight:850;letter-spacing:.045em;text-transform:uppercase}.exsum-chart-title{min-width:0}.exsum-chart-title em{margin-left:7px;color:#747b84;font-size:.78em;font-weight:600;font-style:normal;letter-spacing:0;text-transform:none}.exsum-chart-progress{flex:none;padding:3px 6px;border-radius:3px;background:rgba(29,31,35,.07);color:#1d1f23;font-size:clamp(.52rem,.62vw,.65rem);font-weight:850;letter-spacing:0;text-transform:none;white-space:nowrap}.exsum-chart-shell canvas{min-height:0!important;width:100%!important;height:100%!important}.exsum-readout{flex:none;display:grid;grid-template-columns:auto minmax(0,1fr);gap:clamp(6px,.8vw,10px);align-items:start;padding:clamp(6px,.8vh,9px) clamp(7px,.85vw,11px);border-left:3px solid #ffb81c;border-radius:3px;background:rgba(255,184,28,.10);color:#30343a}.exsum-readout>span{padding-top:1px;color:#a97000;font-size:clamp(.49rem,.59vw,.62rem);font-weight:850;letter-spacing:.1em;line-height:1.25;text-transform:uppercase;white-space:nowrap}.exsum-readout p{margin:0;color:#30343a;font-size:clamp(.68rem,.84vw,.9rem);font-weight:600;line-height:1.35}
.exsum-campaign{min-width:0;min-height:0;flex:0 0 calc(42% - clamp(5px,.5vw,8px));display:flex;flex-direction:column;padding:clamp(8px,1vw,13px);border:1px solid #d9dde1;border-radius:7px;background:#fff;overflow:hidden}.exsum-campaign-heading{flex:none;padding-bottom:clamp(5px,.65vh,8px);border-bottom:1px solid #d9dde1;color:#a97000;font-size:clamp(.65rem,.8vw,.84rem);font-weight:850;letter-spacing:.08em;text-transform:uppercase}.exsum-campaign-heading span{margin-left:7px;color:#646b73;font-size:.8em;font-weight:700;letter-spacing:0;text-transform:none}.exsum-campaign-lanes{min-height:0;flex:1 1 auto;display:grid;grid-template-rows:repeat(4,minmax(0,1fr));padding-top:clamp(3px,.45vh,6px);overflow:hidden}.exsum-campaign-lane{min-height:0;display:flex;flex-direction:column;justify-content:flex-start;padding:clamp(3px,.42vh,6px) 0;border-top:1px solid rgba(29,31,35,.11);overflow:hidden}.exsum-campaign-lane:first-child{border-top:0}.exsum-lane-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px}.exsum-lane-head strong{color:#1d1f23;font-size:clamp(.57rem,.69vw,.73rem);font-weight:850;letter-spacing:.06em;text-transform:uppercase}.exsum-lane-head span{flex:none;color:#646b73;font-size:clamp(.46rem,.55vw,.59rem);font-weight:750;white-space:nowrap}.exsum-lane-outcome{margin-top:1px;color:#30343a;font-size:clamp(.58rem,.7vw,.75rem);font-weight:850;line-height:1.12}.exsum-lane-date{margin-top:1px;color:#a97000;font-size:clamp(.45rem,.52vw,.56rem);font-weight:850;letter-spacing:.04em;line-height:1.1;text-transform:uppercase}.exsum-lane-action{display:-webkit-box;margin:clamp(1px,.2vh,3px) 0 0;overflow:hidden;color:#4d535b;font-size:clamp(.46rem,.55vw,.6rem);font-weight:600;line-height:1.2;-webkit-box-orient:vertical;-webkit-line-clamp:2}.exsum-lane-action span{margin-right:5px;color:#1d1f23;font-size:.9em;font-weight:850;letter-spacing:.07em;text-transform:uppercase}.exsum-lane-progress{display:flex;align-items:baseline;gap:4px;min-width:0;margin-top:2px;color:#5b626b;font-size:clamp(.44rem,.51vw,.56rem);font-weight:700;line-height:1.1}.exsum-lane-progress>span{color:#747b84;font-size:.9em;font-weight:850;letter-spacing:.07em;text-transform:uppercase}.exsum-lane-progress strong{flex:none;color:#25813e;font-weight:850;text-transform:uppercase}.exsum-lane-progress em{min-width:0;overflow:hidden;color:#4d535b;font-size:inherit;font-style:normal;text-overflow:ellipsis;white-space:nowrap}.exsum-lane-progress.tone-on-track strong{color:#25813e}.exsum-lane-progress.tone-sustain strong{color:#25813e}.exsum-lane-progress.tone-at-risk strong{color:#a97000}.exsum-lane-progress.tone-off-track strong{color:#b82e27}.exsum-lane-progress.is-pending strong{color:#747b84}.exsum-lane-update{display:-webkit-box;margin:2px 0 0;overflow:hidden;color:#4d535b;font-size:clamp(.45rem,.54vw,.59rem);font-weight:600;line-height:1.2;-webkit-box-orient:vertical;-webkit-line-clamp:2}.exsum-lane-update.is-pending{color:#747b84;font-style:italic}
@media (max-height:720px){.exsum-root{gap:5px;padding-top:6px;padding-bottom:6px}.exsum-top{gap:3px;padding-bottom:5px}.exsum-title{font-size:1.12rem}.exsum-desired{font-size:.66rem}.exsum-access-context{font-size:.5rem}.exsum-cards{min-height:76px}.exsum-service-group{padding-top:7px}.exsum-card{padding:4px}.exsum-card-label{font-size:.48rem}.exsum-card-value{font-size:1.1rem}.exsum-card-caption{display:none}.exsum-readout{padding:5px 7px}.exsum-readout p{font-size:.6rem}.exsum-campaign,.exsum-chart-shell{padding:7px}.exsum-campaign-control{min-height:19px}.exsum-lane-action{-webkit-line-clamp:1}.exsum-lane-update{-webkit-line-clamp:1}}
@media (max-width:980px){.exsum-root{overflow:auto}.exsum-cards{min-width:760px}.exsum-lower{min-width:760px}.exsum-readout{min-height:3.8em}}
`;
      document.head.appendChild(style);
    }
  });
}());
