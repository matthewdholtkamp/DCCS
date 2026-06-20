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

  function exCard(card) {
    const trend = exTrend(card.value, card.previous, card.betterDirection);
    const roundedDelta = trend.delta === null ? null : exNumber(trend.delta, card.decimals);
    const deltaPrecision = trend.delta && Number(roundedDelta) === 0 ? Math.max(1, card.decimals) : card.decimals;
    const delta = trend.delta === null || trend.delta === 0 ? '' : `${trend.delta > 0 ? '+' : ''}${exNumber(trend.delta, deltaPrecision)}`;
    const valueClass = card.tone === 'black' ? ' exsum-value-chip' : '';
    return `
      <article class="exsum-card">
        <div class="exsum-card-label">${exEsc(card.label)}</div>
        <div class="exsum-card-value tone-${card.tone}${valueClass}">${exDisplay(card.value, card.decimals)}</div>
        <div class="exsum-card-trend tone-${trend.tone}">
          <span class="exsum-arrow">${trend.arrow}</span>${delta ? `<span>${delta}</span>` : '<span>no prior</span>'}
        </div>
        <div class="exsum-card-caption">${exEsc(card.caption)}</div>
      </article>`;
  }

  function exCards(app) {
    const entries = id => app.getMetricEntries(id) || [];
    const acute = entries('pcsl-acute');
    const followup = entries('pcsl-followup');
    const surgery = entries('surgery-total');
    const referrals = entries('mh-active-duty-off-post');
    const lwobs = entries('er-lwobs');
    const census = entries('er-total-census');
    const trainees = entries('er-total-trainees');
    const acuity = entries('er-esi-4-5');
    const latestCensus = exLatest(census);
    const latestLwobs = exLatest(lwobs);
    const ratioEnd = latestCensus ? latestCensus.date : latestLwobs && latestLwobs.date;
    const ratioAt = end => {
      if (!end) return null;
      const denominator = exSum(exWindow(census, 7, end));
      return denominator ? exSum(exWindow(lwobs, 7, end)) / denominator * 100 : null;
    };
    const currentMonth = new Date().toISOString().slice(0, 7);
    const referralCurrent = exMonthBucket(referrals, currentMonth);
    const referralPrevious = exMonthBucket(referrals, exMonthShift(currentMonth, -1));
    const windowCard = (label, rows, decimals, kind, direction, caption) => {
      const latest = exLatest(rows);
      const end = latest && latest.date;
      return {
        label,
        value: end ? exAvg(exWindow(rows, 7, end)) : null,
        previous: end ? exAvg(exWindow(rows, 7, exDaysAgoISO(end, 7))) : null,
        decimals,
        tone: exTone(end ? exAvg(exWindow(rows, 7, end)) : null, kind),
        betterDirection: direction,
        caption
      };
    };

    return [
      {
        label: 'PCSL Acute (hrs)', value: exLatest(acute) && exLatest(acute).value, previous: exPrev(acute) && exPrev(acute).value,
        decimals: 1, tone: exTone(exLatest(acute) && exLatest(acute).value, 'acute'), betterDirection: 'lower', caption: 'latest reported'
      },
      {
        label: 'PCSL Follow-up (days)', value: exLatest(followup) && exLatest(followup).value, previous: exPrev(followup) && exPrev(followup).value,
        decimals: 1, tone: exTone(exLatest(followup) && exLatest(followup).value, 'followup'), betterDirection: 'lower', caption: 'latest reported'
      },
      {
        label: 'Total Surgeries (wk)', value: exLatest(surgery) && exLatest(surgery).value, previous: exPrev(surgery) && exPrev(surgery).value,
        decimals: 0, tone: exTone(exLatest(surgery) && exLatest(surgery).value, 'surgery'), betterDirection: 'higher', caption: 'vs prior week'
      },
      {
        label: 'MH Referrals Off-Post (mo)', value: referralCurrent, previous: referralPrevious,
        decimals: 0, tone: exTone(referralCurrent, 'referrals'), betterDirection: 'lower', caption: exMonthLabel(currentMonth)
      },
      {
        label: 'ER LWOBS % (7d)', value: ratioAt(ratioEnd), previous: ratioAt(ratioEnd && exDaysAgoISO(ratioEnd, 7)),
        decimals: 1, tone: exTone(ratioAt(ratioEnd), 'lwobs'), betterDirection: 'lower', caption: 'latest 7 days'
      },
      windowCard('ER Avg Census (7d)', census, 0, 'informational', null, 'latest 7 days'),
      windowCard('Trainees/day in ER (7d)', trainees, 0, 'trainees', 'lower', 'latest 7 days'),
      windowCard('Cat 4/5 Trainees/day (7d)', acuity, 1, 'acuity', 'lower', 'latest 7 days')
    ];
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
    let cursor = 0;
    return months.map(month => {
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
          <header class="exsum-desired-state"><span>Desired State</span><em>${exEsc(FRAMEWORK.desiredState || '')}</em></header>
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
        </section>`;

      const canvas = el.querySelector('#exsum-kpi-chart');
      if (!canvas || typeof Chart === 'undefined') return;
      const chartData = exChartData(this);
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
            y: { beginAtZero: true, ticks: { precision: 0, color: '#aeb4ba', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,.08)' }, border: { color: 'rgba(255,255,255,.14)' } }
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
.exsum-desired-state{height:7%;min-height:38px;display:flex;align-items:center;gap:clamp(9px,1.5vw,20px);padding:0 clamp(9px,1vw,15px);border:1px solid var(--border-subtle);border-left:3px solid var(--gold);background:rgba(255,255,255,.025);overflow:hidden}.exsum-desired-state span{flex:none;color:var(--gold);font-size:clamp(.58rem,.65vw,.7rem);font-weight:800;letter-spacing:.13em;text-transform:uppercase}.exsum-desired-state em{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-secondary);font-size:clamp(.65rem,.8vw,.82rem);line-height:1.25}
.exsum-cards{height:26%;min-height:126px;display:flex;gap:clamp(5px,.65vw,10px);overflow:hidden}.exsum-card{min-width:0;flex:1 1 0;display:flex;flex-direction:column;padding:clamp(7px,.85vw,12px);border:1px solid var(--border-subtle);background:rgba(255,255,255,.03);overflow:hidden}.exsum-card-label{min-height:2.35em;color:var(--text-secondary);font-size:clamp(.56rem,.68vw,.72rem);font-weight:800;line-height:1.16;text-transform:uppercase;letter-spacing:.035em}.exsum-card-value{align-self:flex-start;margin-top:auto;max-width:100%;color:var(--card-tone,var(--text-primary));font-size:clamp(1.35rem,2.05vw,2.2rem);font-weight:850;line-height:1;letter-spacing:-.05em;white-space:nowrap}.exsum-card-value.tone-green{color:#3fa45b}.exsum-card-value.tone-amber{color:#e0a23d}.exsum-card-value.tone-red{color:#d2433a}.exsum-card-value.tone-grey{color:#8a8f98}.exsum-card-value.tone-black{color:#1d1f23}.exsum-value-chip{padding:.12em .22em;border-radius:3px;background:#e8e8e8}.exsum-card-trend{display:flex;align-items:center;gap:4px;min-height:1.25em;margin-top:clamp(5px,.65vh,8px);font-size:clamp(.57rem,.66vw,.7rem);font-weight:800}.exsum-card-trend.tone-green{color:#3fa45b}.exsum-card-trend.tone-red{color:#d2433a}.exsum-card-trend.tone-grey{color:#8a8f98}.exsum-arrow{font-size:.95em}.exsum-card-caption{margin-top:auto;overflow:hidden;color:var(--text-muted);font-size:clamp(.52rem,.59vw,.64rem);line-height:1.1;white-space:nowrap;text-overflow:ellipsis}
.exsum-lower{min-height:0;flex:1 1 auto;display:flex;gap:clamp(8px,1vw,16px);overflow:hidden}.exsum-left{min-width:0;min-height:0;flex:0 0 calc(58% - clamp(5px,.5vw,8px));display:flex;flex-direction:column;gap:clamp(6px,.8vh,10px);overflow:hidden}.exsum-chart-shell{min-height:0;flex:1 1 auto;display:grid;grid-template-rows:auto minmax(0,1fr);padding:clamp(8px,1vw,13px);border:1px solid var(--border-subtle);background:#191c1f;overflow:hidden}.exsum-chart-heading{margin-bottom:4px;color:#f0f1f2;font-size:clamp(.65rem,.8vw,.84rem);font-weight:800;letter-spacing:.045em;text-transform:uppercase}.exsum-chart-heading span{margin-left:7px;color:#9ba2a8;font-size:.78em;font-weight:600;letter-spacing:0;text-transform:none}.exsum-chart-shell canvas{min-height:0!important;width:100%!important;height:100%!important}.exsum-summary{flex:none;min-height:2.4em;margin:0;padding:0 2px;color:var(--text-secondary);font-size:clamp(.62rem,.77vw,.8rem);line-height:1.34}
.exsum-campaign{min-width:0;min-height:0;flex:0 0 calc(42% - clamp(5px,.5vw,8px));display:flex;flex-direction:column;padding:clamp(8px,1vw,13px);border:1px solid var(--border-subtle);background:rgba(255,255,255,.025);overflow:hidden}.exsum-campaign-heading{flex:none;padding-bottom:clamp(5px,.65vh,8px);border-bottom:1px solid var(--border-subtle);color:var(--gold);font-size:clamp(.65rem,.8vw,.84rem);font-weight:850;letter-spacing:.08em;text-transform:uppercase}.exsum-campaign-heading span{margin-left:7px;color:var(--text-muted);font-size:.8em;font-weight:600;letter-spacing:0;text-transform:none}.exsum-phase-list{position:relative;min-height:0;flex:1 1 auto;display:flex;flex-direction:column;padding:clamp(7px,.8vh,10px) 0 0 clamp(20px,2vw,29px)}.exsum-phase-list:before{position:absolute;top:13px;bottom:8px;left:clamp(7px,.78vw,11px);width:1px;background:var(--border-accent);content:''}.exsum-phase{position:relative;min-height:0;flex:1 1 0;display:flex;flex-direction:column;justify-content:center;padding:clamp(3px,.4vh,6px) 0;opacity:.55;overflow:hidden}.exsum-phase.status-active{flex:1.42 1 0;opacity:1;background:rgba(255,184,28,.055)}.exsum-phase.status-complete{opacity:.64}.exsum-phase-node{position:absolute;top:50%;left:calc(clamp(7px,.78vw,11px) * -1);width:clamp(14px,1.2vw,17px);height:clamp(14px,1.2vw,17px);transform:translate(-50%,-50%);display:grid;place-items:center;border:2px solid #8a8f98;border-radius:50%;background:#1d1f23;color:#8a8f98;font-size:9px;font-weight:900}.exsum-phase.status-active .exsum-phase-node{border-color:#ffb81c;background:#ffb81c;box-shadow:0 0 0 3px rgba(255,184,28,.14)}.exsum-phase.status-complete .exsum-phase-node{border-color:#3fa45b;background:#3fa45b;color:#1d1f23}.exsum-phase-kicker{color:#8a8f98;font-size:clamp(.5rem,.56vw,.6rem);font-weight:850;letter-spacing:.12em;text-transform:uppercase}.exsum-phase.status-active .exsum-phase-kicker{color:#b77800}.exsum-phase-name{color:var(--text-primary);font-size:clamp(.72rem,.95vw,1rem);font-weight:850;line-height:1.15}.exsum-phase.status-active .exsum-phase-name{color:#b77800;font-size:clamp(.8rem,1.12vw,1.18rem)}.exsum-phase-dates{color:var(--text-muted);font-size:clamp(.5rem,.6vw,.65rem);line-height:1.2}.exsum-phase-effort{margin-top:2px;color:var(--text-secondary);font-size:clamp(.55rem,.67vw,.72rem);font-weight:700;line-height:1.18}.exsum-decisive-point{display:flex;align-items:baseline;gap:5px;margin-top:clamp(2px,.3vh,4px);color:var(--text-muted);font-size:clamp(.48rem,.56vw,.6rem);line-height:1.1;white-space:nowrap;overflow:hidden}.exsum-decisive-point span{text-transform:uppercase;letter-spacing:.08em}.exsum-decisive-point strong{overflow:hidden;color:var(--text-secondary);font-size:1em;text-overflow:ellipsis}.exsum-decisive-point em{flex:none;font-style:normal}.exsum-decisive-point.is-next{padding:3px 5px;border-left:2px solid #ffb81c;background:rgba(255,184,28,.11);color:#b77800}.exsum-decisive-point.is-next strong{color:#8a5b00}
@media (max-height:720px){.exsum-root{gap:6px;padding-top:7px;padding-bottom:7px}.exsum-desired-state{min-height:31px}.exsum-cards{min-height:106px}.exsum-card{padding:6px}.exsum-summary{font-size:.6rem}.exsum-campaign,.exsum-chart-shell{padding:7px}.exsum-phase-effort{display:none}}
@media (max-width:980px){.exsum-root{overflow:auto}.exsum-cards{min-width:760px}.exsum-lower{min-width:760px}.exsum-summary{min-height:3.8em}}
`;
      document.head.appendChild(style);
    }
  });
}());
