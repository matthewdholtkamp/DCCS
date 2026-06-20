// Executive Summary (EXSUM) — read-only clinical-operations briefing slide.
(function () {
  window.App = window.App || {};

  const EXSUM_START = '2025-08-01';
  const EXSUM_END = '2027-08-01';
  const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const STATUS_COLORS = { green: '#3fa45b', amber: '#e0a23d', red: '#d2433a', black: '#1d1f23', grey: '#8a8f98' };
  const SERVICE_COLORS = {
    pcsl: '#5aa9e6',
    surgery: '#7c3aed',
    'mental-health': '#46523f',
    emergency: '#d2433a',
    mscoe: '#ffb81c'
  };
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

  function exSparkline(values, stroke) {
    const pts = (values || []).map(Number).filter(Number.isFinite);
    if (pts.length < 2) return '';
    const w = 100, h = 30, min = Math.min(...pts), max = Math.max(...pts), range = (max - min) || 1, step = w / (pts.length - 1);
    const d = pts.map((v, i) => (i ? 'L' : 'M') + (i * step).toFixed(1) + ',' + (h - ((v - min) / range) * h).toFixed(1)).join(' ');
    return '<svg class="exsum-spark" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" aria-hidden="true"><path d="' + d + '" fill="none" stroke="' + stroke + '" stroke-width="1.6" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  function exCard(card) {
    const trend = exTrend(card.value, card.previous, card.betterDirection);
    const deltaPrecision = trend.delta && Number(exNumber(trend.delta, card.decimals)) === 0 ? Math.max(1, card.decimals) : card.decimals;
    const delta = trend.delta === null || trend.delta === 0 ? '' : (trend.delta > 0 ? '+' : '') + exNumber(trend.delta, deltaPrecision);
    const sparkStroke = card.tone === 'amber' ? 'rgba(20,18,8,.55)' : 'rgba(255,255,255,.7)';
    return '' +
      '<article class="exsum-card tone-' + card.tone + '">' +
        '<div class="exsum-card-label">' + exEsc(card.label) + '</div>' +
        '<div class="exsum-card-value">' + exDisplay(card.value, card.decimals) + (card.unit ? '<span class="exsum-unit">' + exEsc(card.unit) + '</span>' : '') + '</div>' +
        '<div class="exsum-card-trend"><span class="exsum-arrow">' + trend.arrow + '</span><span>' + (delta || 'no prior') + '</span></div>' +
        '<div class="exsum-card-spark">' + exSparkline(card.series, sparkStroke) + '</div>' +
        '<div class="exsum-card-caption">' + exEsc(card.caption) + '</div>' +
      '</article>';
  }

  function exCards(app) {
    const get = id => app.getMetricEntries(id) || [];
    const currentMonth = new Date().toISOString().slice(0, 7);
    const SPARK_N = 14;
    const specs = [
      { label: 'PCSL Acute', unit: 'hrs', metric: 'pcsl-acute', mode: 'latest', decimals: 1, kind: 'acute', dir: 'lower', caption: 'latest reported' },
      { label: 'PCSL Follow-up', unit: 'days', metric: 'pcsl-followup', mode: 'latest', decimals: 1, kind: 'followup', dir: 'lower', caption: 'latest reported' },
      { label: 'Total Surgeries', unit: '', metric: 'surgery-total', mode: 'latest', decimals: 0, kind: 'surgery', dir: 'higher', caption: 'vs prior week' },
      { label: 'MH Referrals Off-Post', unit: '', metric: 'mh-active-duty-off-post', mode: 'month', decimals: 0, kind: 'referrals', dir: 'lower', caption: exMonthLabel(currentMonth) },
      { label: 'ER LWOBS', unit: '%', mode: 'ratio', num: 'er-lwobs', den: 'er-total-census', decimals: 1, kind: 'lwobs', dir: 'lower', caption: 'latest 7 days' },
      { label: 'ER Avg Census', unit: '', metric: 'er-total-census', mode: 'window7', decimals: 0, kind: 'informational', dir: null, caption: 'latest 7 days' },
      { label: 'Trainees/day in ER', unit: '', metric: 'er-total-trainees', mode: 'window7', decimals: 0, kind: 'trainees', dir: 'lower', caption: 'latest 7 days' },
      { label: 'Cat 4/5 Trainees/day', unit: '', metric: 'er-esi-4-5', mode: 'window7', decimals: 1, kind: 'acuity', dir: 'lower', caption: 'latest 7 days' }
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
        label: spec.label, value: numericValue, previous: numericPrev, decimals: spec.decimals, unit: spec.unit || '',
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
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 3,
        stepped: true,
        tension: 0
      };
    });
    const totalDates = (FRAMEWORK.serviceLines || []).flatMap(serviceLine =>
      (serviceLine.tasks || []).flatMap(task => exCompletedDates(app, task))
    ).concat((FRAMEWORK.crossCuttingTasks || []).flatMap(task => exCompletedDates(app, task)));
    lines.push({
      label: 'Total', borderColor: '#e8e8e8', backgroundColor: '#e8e8e8', data: exCumulativeSeries(totalDates, months),
      borderWidth: 3.5, pointRadius: 0, pointHoverRadius: 3, stepped: true, tension: 0, order: -1
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
        context.fillStyle = band.status === 'active' ? 'rgba(255,184,28,.11)' : index === 0 ? 'rgba(90,169,230,.055)' : 'rgba(255,255,255,.035)';
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
        context.fillStyle = band.status === 'active' ? 'rgba(255,211,101,.95)' : 'rgba(232,232,232,.56)';
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

  function exCampaign() {
    const phases = FRAMEWORK.phases || [];
    const nextUpcoming = phases.findIndex(phase => phase.status === 'upcoming' && phase.decisivePoint);
    return phases.map((phase, index) => {
      const decisivePoint = phase.decisivePoint || {};
      const status = phase.status || 'upcoming';
      const isNext = index === nextUpcoming;
      return `
        <article class="exsum-phase status-${exEsc(status)} ${isNext ? 'is-next' : ''}">
          <span class="exsum-phase-node">${status === 'complete' ? '✓' : ''}</span>
          <div class="exsum-phase-kicker">${exEsc(status === 'active' ? 'Current Phase' : status)}</div>
          <div class="exsum-phase-name">${exEsc(phase.name || `Phase ${index + 1}`)}</div>
          <div class="exsum-phase-dates">${exEsc(phase.dateRange || '')}</div>
          <div class="exsum-phase-effort">${exEsc(phase.mainEffort || '')}</div>
          <div class="exsum-decisive-point ${isNext ? 'is-next' : ''}">
            <span>Decisive Point</span><strong>${exEsc(decisivePoint.name || '—')}</strong><em>${exEsc(decisivePoint.date || '')}</em>
          </div>
        </article>`;
    }).join('');
  }

  Object.assign(window.App, {
    renderDashboard(el) {
      this.injectDashboardStyles();
      if (this._exsumChart) {
        this._exsumChart.destroy();
        this._exsumChart = null;
      }

      const cards = exCards(this);
      el.innerHTML = `
        <section class="exsum-root" aria-label="Executive Summary clinical operations briefing">
          <header class="exsum-top">
            <div class="exsum-title-row"><h1 class="exsum-title">DCCS — Executive Summary</h1><span class="exsum-asof">As of ${exEsc(exToday())}</span></div>
            <p class="exsum-desired"><span class="exsum-desired-tag">Desired State</span> ${exEsc(FRAMEWORK.desiredState || '')}</p>
          </header>
          <section class="exsum-cards" aria-label="Clinical operations status">${cards.map(exCard).join('')}</section>
          <section class="exsum-lower">
            <div class="exsum-left">
              <div class="exsum-chart-shell"><div class="exsum-chart-heading">Cumulative Completed KPIs <span>01 Aug 2025 — 01 Aug 2027</span></div><canvas id="exsum-kpi-chart" aria-label="Cumulative completed KPI chart"></canvas></div>
              <p class="exsum-summary">${exEsc(exSummary(cards))}</p>
            </div>
            <aside class="exsum-campaign" aria-label="Campaign timeline">
              <div class="exsum-campaign-heading">Campaign Strip <span>Main Effort &amp; Decisive Points</span></div>
              <div class="exsum-phase-list">${exCampaign()}</div>
            </aside>
          </section>
          <footer class="exsum-classification">UNCLASSIFIED</footer>
        </section>`;

      const canvas = el.querySelector('#exsum-kpi-chart');
      if (!canvas || typeof Chart === 'undefined') return;
      const chartData = exChartData(this);
      const exsumKpiMax = exTotalKpiUniverse(this);
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
            legend: { display: true, position: 'bottom', labels: { color: '#d8dadd', boxWidth: 10, boxHeight: 2, padding: 10, font: { size: 10, weight: '600' } } },
            tooltip: { backgroundColor: '#1d1f23', titleColor: '#ffffff', bodyColor: '#e8e8e8', borderColor: 'rgba(255,255,255,.18)', borderWidth: 1 },
            exsumPhaseBands: { bands, months: chartData.months }
          },
          scales: {
            x: { grid: { color: 'rgba(255,255,255,.06)' }, border: { color: 'rgba(255,255,255,.14)' }, ticks: { color: '#aeb4ba', autoSkip: true, maxTicksLimit: 8, font: { size: 9 }, callback(value) { const date = this.getLabelForValue(value); const parts = date.split('-'); return `${MONTH_NAMES[Number(parts[1]) - 1]} ’${parts[0].slice(2)}`; } } },
            y: { beginAtZero: true, max: exsumKpiMax, ticks: { precision: 0, color: '#aeb4ba', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,.08)' }, border: { color: 'rgba(255,255,255,.14)' } }
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
.exsum-top{flex:none;display:flex;flex-direction:column;gap:clamp(3px,.5vh,6px);padding-bottom:clamp(4px,.6vh,8px);border-bottom:1px solid var(--border-subtle)}.exsum-title-row{position:relative;display:flex;align-items:center;justify-content:center}.exsum-title{margin:0;color:var(--text-primary);font-size:clamp(.95rem,1.5vw,1.4rem);font-weight:850;letter-spacing:.04em;text-transform:uppercase}.exsum-asof{position:absolute;right:0;top:50%;transform:translateY(-50%);color:var(--text-muted);font-size:clamp(.55rem,.7vw,.74rem);font-weight:700}.exsum-desired{max-width:95%;margin:0 auto;text-align:center;color:var(--text-secondary);font-size:clamp(.6rem,.74vw,.8rem);line-height:1.32}.exsum-desired-tag{color:var(--gold);font-weight:800;letter-spacing:.1em;text-transform:uppercase;font-size:.86em;margin-right:6px}.exsum-classification{flex:none;margin-top:clamp(3px,.5vh,7px);padding-top:clamp(3px,.5vh,6px);border-top:1px solid var(--border-subtle);text-align:center;color:#5fae6f;font-size:clamp(.6rem,.74vw,.8rem);font-weight:850;letter-spacing:.28em;text-transform:uppercase}
.exsum-cards{height:26%;min-height:132px;display:flex;gap:clamp(5px,.65vw,10px);overflow:hidden}
.exsum-card{min-width:0;flex:1 1 0;display:flex;flex-direction:column;padding:clamp(7px,.8vw,12px);border:1px solid rgba(255,255,255,.14);border-radius:7px;overflow:hidden;color:#fff;background:#565c63}
.exsum-card.tone-green{background:#2f9e5b}
.exsum-card.tone-amber{background:#dca12f;color:#171407;border-color:rgba(0,0,0,.2)}
.exsum-card.tone-red{background:#cc4034}
.exsum-card.tone-black{background:#20242a;border-color:rgba(255,255,255,.22)}
.exsum-card.tone-grey{background:#565c63}
.exsum-card-label{min-height:2.2em;font-size:clamp(.55rem,.66vw,.7rem);font-weight:800;line-height:1.16;text-transform:uppercase;letter-spacing:.035em;opacity:.85}
.exsum-card-value{margin-top:2px;font-size:clamp(1.35rem,2.05vw,2.25rem);font-weight:850;line-height:1;letter-spacing:-.04em;white-space:nowrap;font-variant-numeric:tabular-nums;display:flex;align-items:baseline;gap:.12em}.exsum-unit{font-size:.46em;font-weight:800;opacity:.7;letter-spacing:0}
.exsum-card-trend{display:flex;align-items:center;gap:4px;min-height:1.1em;margin-top:2px;font-size:clamp(.56rem,.64vw,.68rem);font-weight:800;opacity:.9}
.exsum-arrow{font-size:.95em}
.exsum-card-spark{flex:1 1 auto;min-height:16px;margin-top:clamp(3px,.5vh,7px);display:flex;align-items:flex-end}
.exsum-spark{width:100%;height:100%;display:block}
.exsum-card-caption{margin-top:clamp(2px,.4vh,5px);overflow:hidden;font-size:clamp(.5rem,.57vw,.62rem);line-height:1.1;white-space:nowrap;text-overflow:ellipsis;opacity:.7}
.exsum-lower{min-height:0;flex:1 1 auto;display:flex;gap:clamp(8px,1vw,16px);overflow:hidden}.exsum-left{min-width:0;min-height:0;flex:0 0 calc(58% - clamp(5px,.5vw,8px));display:flex;flex-direction:column;gap:clamp(6px,.8vh,10px);overflow:hidden}.exsum-chart-shell{min-height:0;flex:1 1 auto;display:grid;grid-template-rows:auto minmax(0,1fr);padding:clamp(8px,1vw,13px);border:1px solid var(--border-subtle);border-radius:7px;background:rgba(255,255,255,.025);overflow:hidden}.exsum-chart-heading{margin-bottom:4px;color:#f0f1f2;font-size:clamp(.65rem,.8vw,.84rem);font-weight:800;letter-spacing:.045em;text-transform:uppercase}.exsum-chart-heading span{margin-left:7px;color:#9ba2a8;font-size:.78em;font-weight:600;letter-spacing:0;text-transform:none}.exsum-chart-shell canvas{min-height:0!important;width:100%!important;height:100%!important}.exsum-summary{flex:none;min-height:2.4em;margin:0;padding:0 2px;color:var(--text-secondary);font-size:clamp(.62rem,.77vw,.8rem);line-height:1.34}
.exsum-campaign{min-width:0;min-height:0;flex:0 0 calc(42% - clamp(5px,.5vw,8px));display:flex;flex-direction:column;padding:clamp(8px,1vw,13px);border:1px solid var(--border-subtle);border-radius:7px;background:rgba(255,255,255,.025);overflow:hidden}.exsum-campaign-heading{flex:none;padding-bottom:clamp(5px,.65vh,8px);border-bottom:1px solid var(--border-subtle);color:var(--gold);font-size:clamp(.65rem,.8vw,.84rem);font-weight:850;letter-spacing:.08em;text-transform:uppercase}.exsum-campaign-heading span{margin-left:7px;color:var(--text-muted);font-size:.8em;font-weight:600;letter-spacing:0;text-transform:none}.exsum-phase-list{position:relative;min-height:0;flex:1 1 auto;display:flex;flex-direction:column;padding:clamp(7px,.8vh,10px) 0 0 clamp(20px,2vw,29px)}.exsum-phase-list:before{position:absolute;top:13px;bottom:8px;left:clamp(7px,.78vw,11px);width:1px;background:var(--border-accent);content:''}.exsum-phase{position:relative;min-height:0;flex:1 1 0;display:flex;flex-direction:column;justify-content:center;padding:clamp(3px,.4vh,6px) 0;opacity:.55;overflow:hidden}.exsum-phase.status-active{flex:1.42 1 0;opacity:1;background:rgba(255,184,28,.055)}.exsum-phase.status-complete{opacity:.64}.exsum-phase-node{position:absolute;top:50%;left:calc(clamp(7px,.78vw,11px) * -1);width:clamp(14px,1.2vw,17px);height:clamp(14px,1.2vw,17px);transform:translate(-50%,-50%);display:grid;place-items:center;border:2px solid #8a8f98;border-radius:50%;background:#1d1f23;color:#8a8f98;font-size:9px;font-weight:900}.exsum-phase.status-active .exsum-phase-node{border-color:#ffb81c;background:#ffb81c;box-shadow:0 0 0 3px rgba(255,184,28,.14)}.exsum-phase.status-complete .exsum-phase-node{border-color:#3fa45b;background:#3fa45b;color:#1d1f23}.exsum-phase-kicker{color:#8a8f98;font-size:clamp(.5rem,.56vw,.6rem);font-weight:850;letter-spacing:.12em;text-transform:uppercase}.exsum-phase.status-active .exsum-phase-kicker{color:#b77800}.exsum-phase-name{color:var(--text-primary);font-size:clamp(.72rem,.95vw,1rem);font-weight:850;line-height:1.15}.exsum-phase.status-active .exsum-phase-name{color:#b77800;font-size:clamp(.8rem,1.12vw,1.18rem)}.exsum-phase-dates{color:var(--text-muted);font-size:clamp(.5rem,.6vw,.65rem);line-height:1.2}.exsum-phase-effort{margin-top:2px;color:var(--text-secondary);font-size:clamp(.55rem,.67vw,.72rem);font-weight:700;line-height:1.18}.exsum-decisive-point{display:flex;align-items:baseline;gap:5px;margin-top:clamp(2px,.3vh,4px);color:var(--text-muted);font-size:clamp(.48rem,.56vw,.6rem);line-height:1.1;white-space:nowrap;overflow:hidden}.exsum-decisive-point span{text-transform:uppercase;letter-spacing:.08em}.exsum-decisive-point strong{overflow:hidden;color:var(--text-secondary);font-size:1em;text-overflow:ellipsis}.exsum-decisive-point em{flex:none;font-style:normal}.exsum-decisive-point.is-next{padding:3px 5px;border-left:2px solid #ffb81c;background:rgba(255,184,28,.11);color:#b77800}.exsum-decisive-point.is-next strong{color:#8a5b00}
@media (max-height:720px){.exsum-root{gap:6px;padding-top:7px;padding-bottom:7px}.exsum-desired-state{min-height:31px}.exsum-cards{min-height:106px}.exsum-card{padding:6px}.exsum-summary{font-size:.6rem}.exsum-campaign,.exsum-chart-shell{padding:7px}.exsum-phase-effort{display:none}}
@media (max-width:980px){.exsum-root{overflow:auto}.exsum-cards{min-width:760px}.exsum-lower{min-width:760px}.exsum-summary{min-height:3.8em}}
`;
      document.head.appendChild(style);
    }
  });
}());
