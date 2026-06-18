// DCCS Operational Framework - Emergency Department Chart.js renderers
(function () {
  window.App = window.App || {};
  Object.assign(window.App, {
  // ===== EMERGENCY DEPARTMENT — Chart.js Renderer =====
  // Metric keys mirroring the ER Commander's Dashboard TREND_METRICS
  ER_TREND_METRICS: [
    { key: 'er-total-census',   label: 'Census',   color: '#000000' },
    { key: 'er-total-trainees', label: 'Trainees', color: '#4b5320' },
    { key: 'er-esi-4-5',       label: 'Cat 4/5',  color: '#2e8b2e' },
    { key: 'er-esi-3',         label: 'Cat 2/3',  color: '#e69500' },
    { key: 'er-esi-1-2',       label: 'Cat 1',    color: '#c1272d' },
    { key: 'er-lwobs',         label: 'LWOBS',    color: '#b8860b' },
  ],

  // Stored Chart.js instances so we can destroy before re-render
  _erCharts: {},

  _destroyErChart(id) {
    if (this._erCharts[id]) {
      this._erCharts[id].destroy();
      delete this._erCharts[id];
    }
  },

  /** Gaussian-weighted centered rolling average (matches ER dashboard). */
  smoothRollingAverage(values, windowSize) {
    if (values.length < 2) return values.slice();
    const half = Math.floor(windowSize / 2);
    const sigma = Math.max(0.8, half / 2);
    const out = [];
    for (let i = 0; i < values.length; i++) {
      let sumW = 0, sumWY = 0;
      const lo = Math.max(0, i - half);
      const hi = Math.min(values.length - 1, i + half);
      for (let j = lo; j <= hi; j++) {
        const d = j - i;
        const w = Math.exp(-(d * d) / (2 * sigma * sigma));
        sumW += w;
        sumWY += w * values[j];
      }
      out.push(sumW > 0 ? sumWY / sumW : values[i]);
    }
    return out;
  },

  /** First-half vs second-half average change for trend narratives. */
  firstHalfSecondHalfChange(values) {
    const n = values.length;
    if (n < 4) return { dir: 'stable', pct: 0 };
    const mid = Math.floor(n / 2);
    const fh = values.slice(0, mid);
    const sh = values.slice(mid);
    const fhAvg = fh.reduce((a, b) => a + b, 0) / fh.length;
    const shAvg = sh.reduce((a, b) => a + b, 0) / sh.length;
    if (fhAvg === 0 && shAvg === 0) return { dir: 'stable', pct: 0 };
    if (fhAvg === 0) return { dir: 'rising', pct: 100 };
    const pct = ((shAvg - fhAvg) / fhAvg) * 100;
    let dir = 'stable';
    if (pct > 10) dir = 'rising';
    else if (pct < -10) dir = 'falling';
    return { dir, pct: Math.abs(Math.round(pct)) };
  },

  /** Build a formatted short date like "Jun 2" from an ISO date string. */
  fmtShortDateStr(dateStr) {
    if (!dateStr) return '';
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const parts = dateStr.split('-');
    if (parts.length < 3) return dateStr;
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    return months[m] + ' ' + d;
  },

  /** Gather ER synced data into a sorted array of { date, census, trainees, cat45, cat23, cat1, lwobs }. */
  getERDailyData() {
    const store = this.getMetricStore();
    const census   = store['er-total-census']   || [];
    const trainees = store['er-total-trainees'] || [];
    const esi12    = store['er-esi-1-2']        || [];
    const esi3     = store['er-esi-3']          || [];
    const esi45    = store['er-esi-4-5']        || [];
    const lwobs    = store['er-lwobs']          || [];

    // Build a map keyed by date
    const dateMap = {};
    const addTo = (arr, key) => arr.forEach(e => {
      if (!dateMap[e.date]) dateMap[e.date] = {};
      dateMap[e.date][key] = e.value;
    });
    addTo(census, 'census');
    addTo(trainees, 'trainees');
    addTo(esi12, 'cat1');
    addTo(esi3, 'cat23');
    addTo(esi45, 'cat45');
    addTo(lwobs, 'lwobs');

    return Object.entries(dateMap)
      .map(([date, vals]) => ({
        date,
        census:   vals.census   || 0,
        trainees: vals.trainees || 0,
        cat45:    vals.cat45    || 0,
        cat23:    vals.cat23    || 0,
        cat1:     vals.cat1     || 0,
        lwobs:    vals.lwobs    || 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  },

  /** Build Chart.js datasets for ER trend chart (mirrors ER dashboard logic). */
  buildERTrendDatasets(data, showTrend, windowSize) {
    const datasets = [];
    const keyMap = {
      'er-total-census':   'census',
      'er-total-trainees': 'trainees',
      'er-esi-4-5':        'cat45',
      'er-esi-3':          'cat23',
      'er-esi-1-2':        'cat1',
      'er-lwobs':          'lwobs',
    };

    this.ER_TREND_METRICS.forEach(m => {
      const dataKey = keyMap[m.key];
      const values = data.map(d => d[dataKey] || 0);

      datasets.push({
        label:           m.label,
        metricKey:       m.key,
        isTrend:         false,
        data:            values,
        borderColor:     m.color + (showTrend ? '66' : 'cc'),
        backgroundColor: m.color + '33',
        tension:         0.2,
        pointRadius:     showTrend ? 2 : 3,
        pointHoverRadius: 5,
        borderWidth:     showTrend ? 1 : 2,
        fill:            false,
      });

      if (showTrend && values.length >= 2) {
        const smoothed = this.smoothRollingAverage(values, windowSize);
        datasets.push({
          label:           m.label + ' (trend)',
          metricKey:       m.key,
          isTrend:         true,
          data:            smoothed,
          borderColor:     m.color,
          backgroundColor: 'transparent',
          borderWidth:     2.5,
          pointRadius:     0,
          pointHoverRadius: 0,
          fill:            false,
          tension:         0.4,
          order:           -1,
        });
      }
    });
    return datasets;
  },

  /** Build chart options matching the ER dashboard aesthetic. */
  buildERChartOptions(showTrend, xLabel) {
    const self = this;
    return {
      responsive:          true,
      maintainAspectRatio: false,
      interaction:         { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            generateLabels(chart) {
              const seen = new Set();
              return chart.data.datasets.map((ds, i) => {
                if (ds.isTrend) return null;
                if (seen.has(ds.metricKey)) return null;
                seen.add(ds.metricKey);
                const meta = chart.getDatasetMeta(i);
                return {
                  text:        ds.label,
                  metricKey:   ds.metricKey,
                  fillStyle:   ds.borderColor,
                  strokeStyle: ds.borderColor,
                  lineWidth:   2,
                  hidden:      meta.hidden,
                  index:       i,
                };
              }).filter(Boolean);
            }
          },
          onClick(e, legendItem, legend) {
            const chart = legend.chart;
            const clickedKey = legendItem.metricKey;
            chart.data.datasets.forEach((ds, i) => {
              if (ds.metricKey === clickedKey) {
                const meta = chart.getDatasetMeta(i);
                meta.hidden = !meta.hidden;
              }
            });
            chart.update();
          },
        },
        tooltip: {
          callbacks: {
            filter: (item) => !item.dataset.isTrend,
          }
        },
      },
      scales: {
        x: {
          title: { display: true, text: xLabel || 'Date' },
          grid:  { color: 'rgba(255,255,255,0.06)' },
          ticks: { maxRotation: 60, minRotation: 0, autoSkip: true, maxTicksLimit: 20, color: 'var(--text-muted)' }
        },
        y: {
          beginAtZero: true,
          title: { display: true, text: 'Count' },
          grid:  { color: 'rgba(255,255,255,0.06)' }
        }
      }
    };
  },

  /** Generate a plain-English insight for the full history trend. */
  generateERFullHistoryInsight(data) {
    if (!data || data.length < 2) return '<strong>Not enough data</strong> — load at least two days to see trend analysis.';
    const trainees = data.map(d => d.trainees || 0);
    const cat45    = data.map(d => d.cat45 || 0);
    const lwobs    = data.map(d => d.lwobs || 0);

    const totalTrainees = trainees.reduce((a, b) => a + b, 0);
    const totalCat45    = cat45.reduce((a, b) => a + b, 0);
    const totalLwobs    = lwobs.reduce((a, b) => a + b, 0);

    const avgT = (totalTrainees / data.length).toFixed(1);
    const avgC = (totalCat45 / data.length).toFixed(1);
    const avgL = (totalLwobs / data.length).toFixed(1);

    const tChange = this.firstHalfSecondHalfChange(trainees);
    const cChange = this.firstHalfSecondHalfChange(cat45);
    const lChange = this.firstHalfSecondHalfChange(lwobs);

    const cat45Pct  = totalTrainees > 0 ? Math.round((totalCat45 / totalTrainees) * 100) : 0;
    const lwobsRate = totalTrainees > 0 ? ((totalLwobs / totalTrainees) * 100).toFixed(1) : '0';

    const tPhrase = tChange.dir === 'stable' ? 'has been stable' : `is <strong>${tChange.dir} ${tChange.pct}%</strong>`;
    const cPhrase = cChange.dir === 'stable' ? 'stable' : `${cChange.dir} ${cChange.pct}%`;
    const lPhrase = lChange.dir === 'stable' ? 'stable' : `${lChange.dir} ${lChange.pct}%`;

    const s1 = `Across <strong>${data.length} days</strong>, trainee volume averages <strong>${avgT}/day</strong> and ${tPhrase}; <strong>${cat45Pct}%</strong> of trainee visits are Cat 4/5 (low-acuity).`;

    let lwobsFlag = '';
    if (parseFloat(lwobsRate) > 10) lwobsFlag = ' — <strong>elevated LWOBS rate warrants throughput review.</strong>';
    else if (parseFloat(lwobsRate) > 5) lwobsFlag = ' — watch for upward movement.';

    const s2 = `Cat 4/5 averages <strong>${avgC}/day</strong> (${cPhrase}); LWOBS averages <strong>${avgL}/day</strong> (${lPhrase}), or <strong>${lwobsRate}%</strong> of trainee visits${lwobsFlag}`;
    return s1 + ' ' + s2;
  },

  /** Generate a plain-English insight for the last 30 days. */
  generateERLast30Insight(data) {
    if (!data || data.length < 2) return '<strong>Not enough data</strong> — load at least two days to see trend analysis.';
    const trainees = data.map(d => d.trainees || 0);
    const cat45    = data.map(d => d.cat45 || 0);
    const lwobs    = data.map(d => d.lwobs || 0);

    const totalTrainees = trainees.reduce((a, b) => a + b, 0);
    const totalCat45    = cat45.reduce((a, b) => a + b, 0);
    const totalLwobs    = lwobs.reduce((a, b) => a + b, 0);

    const avgT = (totalTrainees / data.length).toFixed(1);
    const avgC = (totalCat45 / data.length).toFixed(1);
    const avgL = (totalLwobs / data.length).toFixed(1);

    const tChange = this.firstHalfSecondHalfChange(trainees);
    const cChange = this.firstHalfSecondHalfChange(cat45);
    const lChange = this.firstHalfSecondHalfChange(lwobs);

    const cat45Pct  = totalTrainees > 0 ? Math.round((totalCat45 / totalTrainees) * 100) : 0;
    const lwobsRate = totalTrainees > 0 ? ((totalLwobs / totalTrainees) * 100).toFixed(1) : '0';

    const tPhrase = tChange.dir === 'stable' ? 'holding steady' : `<strong>${tChange.dir} ${tChange.pct}%</strong> vs the first half`;
    const cPhrase = cChange.dir === 'stable' ? 'flat' : `${cChange.dir} ${cChange.pct}%`;
    const lPhrase = lChange.dir === 'stable' ? 'flat' : `${lChange.dir} ${lChange.pct}%`;

    const s1 = `Over the last <strong>${data.length} days</strong>, trainee volume averages <strong>${avgT}/day</strong> and is ${tPhrase}; Cat 4/5 represents <strong>${cat45Pct}%</strong> of trainee visits (avg ${avgC}/day, ${cPhrase}).`;

    let lwobsFlag = '';
    if (parseFloat(lwobsRate) > 10) lwobsFlag = ' — <strong>elevated LWOBS rate warrants command attention.</strong>';
    else if (parseFloat(lwobsRate) > 5) lwobsFlag = ' — watch for further increase.';
    else lwobsFlag = ' — within acceptable range.';

    const s2 = `LWOBS averages <strong>${avgL}/day</strong> (${lPhrase}), running at <strong>${lwobsRate}%</strong> of trainee visits${lwobsFlag}`;
    return s1 + ' ' + s2;
  },

  /** Render the ED metrics section with Chart.js canvases instead of SVG. No data entry forms. */
  renderEmergencyTrackedMetrics(sl) {
    const data = this.getERDailyData();
    const dayCount = data.length;
    const last30 = data.slice(-30);

    return `
      <section class="metrics-section er-chartjs-section" aria-label="ED Performance Trends">
        <div class="metrics-header">
          <div>
            <div class="metrics-eyebrow">Daily Tracked Metrics</div>
            <h2>ED Performance Trends</h2>
          </div>
          <p>Auto-synced from the ER Commander's Dashboard. Smoothed trend = centered 7-point Gaussian rolling average. Click a legend label to toggle that metric and its trend line.</p>
        </div>

        <div class="er-chart-panel">
          <div class="er-chart-panel-header">
            <h3>Trends Over Time — Full History</h3>
            <div class="er-chart-controls">
              <label class="er-chart-toggle"><input type="checkbox" id="erTrendToggle" checked onchange="App.drawEmergencyCharts()"> Show Smoothed Trend</label>
              <span class="er-chart-badge" id="erFullBadge">${dayCount} Day${dayCount === 1 ? '' : 's'}</span>
            </div>
          </div>
          <div class="er-chart-canvas-wrap">
            <canvas id="er-full-history"></canvas>
          </div>
          <div class="er-chart-footnote">Shows every day of synced data. <b>Smoothed trend</b> = centered 7-point Gaussian rolling average. Click a legend label to toggle that metric <b>and</b> its trend line together.</div>
          <div class="er-chart-insight" id="erFullInsight"></div>
        </div>

        <div class="er-chart-panel">
          <div class="er-chart-panel-header">
            <h3>Trends Over Time — Last 30 Days</h3>
            <div class="er-chart-controls">
              <span class="er-chart-badge" id="erLast30Badge">${last30.length} Day${last30.length === 1 ? '' : 's'}</span>
            </div>
          </div>
          <div class="er-chart-canvas-wrap">
            <canvas id="er-last30"></canvas>
          </div>
          <div class="er-chart-footnote">Most recent 30 days, daily detail. Trend toggle above applies here too.</div>
          <div class="er-chart-insight" id="erLast30Insight"></div>
        </div>
      </section>
    `;
  },

  /** Draw (or re-draw) the two Chart.js ER canvases. prefix is used for presentation mode IDs. */
  drawEmergencyCharts(prefix) {
    const p = prefix || '';
    const allData = this.getERDailyData();
    if (!allData.length) {
      console.warn("DCCS drawEmergencyCharts: No data to draw charts!");
      return;
    }

    const trendToggle = document.getElementById(p ? null : 'erTrendToggle');
    const showTrend = trendToggle ? trendToggle.checked : true;

    // --- Full History ---
    const fullCanvasId = p + 'er-full-history';
    const fullCanvas = document.getElementById(fullCanvasId);
    if (fullCanvas) {
      this._destroyErChart(fullCanvasId);
      const labels   = allData.map(d => this.fmtShortDateStr(d.date));
      const datasets = this.buildERTrendDatasets(allData, showTrend, 7);
      const options  = this.buildERChartOptions(showTrend, 'Date');

      try {
        if (typeof Chart === 'undefined') {
          throw new ReferenceError("Chart.js library (Chart class) is not loaded or is undefined.");
        }
        this._erCharts[fullCanvasId] = new Chart(
          fullCanvas.getContext('2d'),
          { type: 'line', data: { labels, datasets }, options }
        );
      } catch (err) {
        console.error("DCCS Chart.js full history creation error:", err);
        const insight = document.getElementById(p + 'er-full-insight') || document.getElementById('erFullInsight');
        if (insight) {
          insight.innerHTML = `<div style="color:#c1272d;background:rgba(193,39,45,0.06);padding:10px;border-left:4px solid #c1272d;margin-top:10px;font-family:monospace;"><strong>Chart Rendering Error (Full History):</strong> ${err.message}<br><pre style="font-size:11px;margin-top:5px;white-space:pre-wrap;overflow-x:auto;">${err.stack}</pre></div>`;
        }
      }

      // Update badge and insight
      const badge = document.getElementById(p ? null : 'erFullBadge');
      if (badge) badge.textContent = allData.length + ' Day' + (allData.length === 1 ? '' : 's');
      const insight = document.getElementById(p + 'er-full-insight') || document.getElementById('erFullInsight');
      if (insight && !insight.innerHTML.includes('Chart Rendering Error')) {
        insight.innerHTML = this.generateERFullHistoryInsight(allData);
      }
    }

    // --- Last 30 ---
    const last30 = allData.slice(-30);
    const l30CanvasId = p + 'er-last30';
    const l30Canvas = document.getElementById(l30CanvasId);
    if (l30Canvas) {
      this._destroyErChart(l30CanvasId);
      const labels   = last30.map(d => this.fmtShortDateStr(d.date));
      const datasets = this.buildERTrendDatasets(last30, showTrend, 7);
      const options  = this.buildERChartOptions(showTrend, 'Date');
      options.scales.x.ticks.maxTicksLimit = 30;

      try {
        if (typeof Chart === 'undefined') {
          throw new ReferenceError("Chart.js library (Chart class) is not loaded or is undefined.");
        }
        this._erCharts[l30CanvasId] = new Chart(
          l30Canvas.getContext('2d'),
          { type: 'line', data: { labels, datasets }, options }
        );
      } catch (err) {
        console.error("DCCS Chart.js last 30 days creation error:", err);
        const insight = document.getElementById(p + 'er-last30-insight') || document.getElementById('erLast30Insight');
        if (insight) {
          insight.innerHTML = `<div style="color:#c1272d;background:rgba(193,39,45,0.06);padding:10px;border-left:4px solid #c1272d;margin-top:10px;font-family:monospace;"><strong>Chart Rendering Error (Last 30 Days):</strong> ${err.message}<br><pre style="font-size:11px;margin-top:5px;white-space:pre-wrap;overflow-x:auto;">${err.stack}</pre></div>`;
        }
      }

      const badge = document.getElementById(p ? null : 'erLast30Badge');
      if (badge) badge.textContent = last30.length + ' Day' + (last30.length === 1 ? '' : 's');
      const insight = document.getElementById(p + 'er-last30-insight') || document.getElementById('erLast30Insight');
      if (insight && !insight.innerHTML.includes('Chart Rendering Error')) {
        insight.innerHTML = this.generateERLast30Insight(last30);
      }
    }
  },
  });
}());
