// DCCS Operational Framework - MSCoE unit-volume drilldown and patient table
(function () {
  window.App = window.App || {};
  Object.assign(window.App, {
  // ===== MSCoE Surgeon Tab / Trainee Care Model widget implementation =====
  uvState: {
    level:    'bde',
    bde:      null,
    bn:       null,
    gran:     'auto',
    loIdx:    null,
    hiIdx:    null,
  },
  uvDateList: [],
  allPatients: [],
 
  BDE_ORDER: [
    '3rd Chemical BDE',
    '14th Military Police BDE',
    '1st Engineer BDE',
    '43rd Reception BN',
    'Other Units'
  ],
 
  UV_PALETTE: [
    '#4b5320','#c1272d','#2e8b2e','#e69500','#3d6e9c',
    '#7d3c98','#16a085','#d35400','#5d4037','#1abc9c',
    '#8e44ad','#2c3e50','#e74c3c','#b8860b','#0066cc',
    '#FFCC01','#006400','#8b008b','#ff1493','#00ced1'
  ],
 
  uvActiveEsi() {
    return {
      red:     document.getElementById('uvEsiRed')?.checked ?? true,
      orange:  document.getElementById('uvEsiOrange')?.checked ?? true,
      green:   document.getElementById('uvEsiGreen')?.checked ?? true,
      unknown: document.getElementById('uvEsiUnknown')?.checked ?? true,
    };
  },
 
  uvAcuityPasses(acuity, esi) {
    if (acuity === 'red')    return esi.red;
    if (acuity === 'orange') return esi.orange;
    if (acuity === 'green')  return esi.green;
    return esi.unknown;
  },
 
  uvSetGran(g) {
    this.uvState.gran = g;
    document.querySelectorAll('#uvGranRow .uv-gran-btn').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-gran') === g);
    });
    this.renderUnitVolumeChart();
  },
 
  uvGoBde() {
    this.uvState.level = 'bde';
    this.uvState.bde = null;
    this.uvState.bn = null;
    this.renderUnitVolumeChart();
  },
 
  uvGoBn(bde) {
    this.uvState.level = 'bn';
    this.uvState.bde = bde;
    this.uvState.bn = null;
    this.renderUnitVolumeChart();
  },
 
  uvGoCo(bn) {
    this.uvState.level = 'co';
    this.uvState.bn = bn;
    this.renderUnitVolumeChart();
  },
 
  uvRenderBreadcrumb() {
    const el = document.getElementById('uvBreadcrumb');
    if (!el) return;
    const crumbs = [];
    crumbs.push(
      this.uvState.level === 'bde'
        ? `<button class="uv-crumb current">All Brigades</button>`
        : `<button class="uv-crumb" onclick="App.uvGoBde()">All Brigades</button>`
    );
    if (this.uvState.bde) {
      crumbs.push('<span class="uv-sep">▸</span>');
      crumbs.push(
        this.uvState.level === 'bn'
          ? `<button class="uv-crumb current">${this.escapeHtml(this.uvState.bde)}</button>`
          : `<button class="uv-crumb" onclick="App.uvGoBn('${this.escapeHtml(this.uvState.bde).replace(/'/g, "\\'")}')">${this.escapeHtml(this.uvState.bde)}</button>`
      );
    }
    if (this.uvState.bn) {
      crumbs.push('<span class="uv-sep">▸</span>');
      crumbs.push(`<button class="uv-crumb current">BN ${this.escapeHtml(this.uvState.bn)}</button>`);
    }
    el.innerHTML = crumbs.join('');
  },
 
  uvEffectiveGran(spanDays) {
    if (this.uvState.gran !== 'auto') return this.uvState.gran;
    if (spanDays <= 45)  return 'day';
    if (spanDays <= 180) return 'week';
    return 'month';
  },
 
  uvBucketKey(d, gran) {
    if (gran === 'day') {
      return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    }
    if (gran === 'week') {
      const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      day.setDate(day.getDate() - day.getDay());
      return day.getTime();
    }
    return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  },
 
  uvBucketLabel(ts, gran) {
    const d = new Date(ts);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    if (gran === 'month') return months[d.getMonth()] + ' ' + d.getFullYear();
    if (gran === 'week')  return 'Wk ' + months[d.getMonth()] + ' ' + d.getDate();
    return months[d.getMonth()] + ' ' + d.getDate();
  },
 
  uvBuildDatePickers() {
    const set = new Set();
    this.allPatients.forEach(p => {
      if (!p.date) return;
      set.add(new Date(p.date.getFullYear(), p.date.getMonth(), p.date.getDate()).getTime());
    });
    this.uvDateList = Array.from(set).sort((a, b) => a - b);

    const loInput = document.getElementById('uvDatePickerLo');
    const hiInput = document.getElementById('uvDatePickerHi');
    if (!loInput || !hiInput) return;

    if (!this.uvDateList.length) {
      loInput.value = ''; hiInput.value = '';
      this.uvState.loIdx = this.uvState.hiIdx = 0;
      return;
    }

    const maxIdx = this.uvDateList.length - 1;
    const fmtISO = (ts) => {
      const d = new Date(ts);
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    };

    // Set min/max on both pickers
    loInput.min = fmtISO(this.uvDateList[0]);
    loInput.max = fmtISO(this.uvDateList[maxIdx]);
    hiInput.min = fmtISO(this.uvDateList[0]);
    hiInput.max = fmtISO(this.uvDateList[maxIdx]);

    // Default: last 30 calendar days
    const lastTs = this.uvDateList[maxIdx];
    const cutoffTs = lastTs - 29 * 24 * 60 * 60 * 1000;
    let defLo = 0;
    for (let i = 0; i <= maxIdx; i++) {
      if (this.uvDateList[i] >= cutoffTs) { defLo = i; break; }
    }

    this.uvState.loIdx = defLo;
    this.uvState.hiIdx = maxIdx;
    loInput.value = fmtISO(this.uvDateList[defLo]);
    hiInput.value = fmtISO(this.uvDateList[maxIdx]);
  },

  uvOnDatePickerChange() {
    const loInput = document.getElementById('uvDatePickerLo');
    const hiInput = document.getElementById('uvDatePickerHi');
    if (!loInput || !hiInput || !this.uvDateList.length) return;

    let loVal = loInput.value;
    let hiVal = hiInput.value;
    if (!loVal || !hiVal) return;

    // Enforce lo <= hi
    if (loVal > hiVal) {
      const tmp = loVal; loVal = hiVal; hiVal = tmp;
      loInput.value = loVal;
      hiInput.value = hiVal;
    }

    // Convert date strings to timestamps for comparison
    const loParts = loVal.split('-');
    const loTs = new Date(+loParts[0], +loParts[1] - 1, +loParts[2]).getTime();
    const hiParts = hiVal.split('-');
    const hiTs = new Date(+hiParts[0], +hiParts[1] - 1, +hiParts[2]).getTime();

    // Find closest indices in uvDateList
    let bestLo = 0;
    for (let i = 0; i < this.uvDateList.length; i++) {
      if (this.uvDateList[i] >= loTs) { bestLo = i; break; }
      bestLo = i;
    }
    let bestHi = this.uvDateList.length - 1;
    for (let i = this.uvDateList.length - 1; i >= 0; i--) {
      if (this.uvDateList[i] <= hiTs) { bestHi = i; break; }
      bestHi = i;
    }
    if (bestLo > bestHi) bestLo = bestHi;

    this.uvState.loIdx = bestLo;
    this.uvState.hiIdx = bestHi;
    this.renderUnitVolumeChart();
  },
 
  renderMscoeTrackedMetrics(sl) {
    const store = this.getMetricStore();
    const patients = store['er-patients'] || [];
    const patientCount = patients.length;
 
    return `
      <section class="metrics-section er-chartjs-section" aria-label="MSCoE Trainee Performance Trends">
        <div class="metrics-header">
          <div>
            <div class="metrics-eyebrow">Trainee Check-in Analysis</div>
            <h2>Trainee ER Usage & Unit Volume</h2>
          </div>
          <p>Analyzing individual trainee check-ins dynamically synced from the ER. Drill down by clicking lines or labels. Filters apply to both the chart and the check-in table below.</p>
        </div>
 
        <!-- Chart Panel -->
        <div class="er-chart-panel">
          <div class="er-chart-panel-header">
            <h3>Unit Volume Over Time — BDE / BN / CO Drill-Down</h3>
            <div class="er-chart-controls">
              <span class="er-chart-badge" id="mscoeVolumeBadge">${patientCount} Record${patientCount === 1 ? '' : 's'}</span>
            </div>
          </div>
 
          <!-- Unit Volume Toolbar -->
          <div class="uv-toolbar">
            <div class="uv-block" style="flex: 1; min-width: 260px;">
              <span class="uv-block-title">Drill Level</span>
              <div class="uv-breadcrumb" id="uvBreadcrumb"></div>
            </div>
 
            <div class="uv-block">
              <span class="uv-block-title">Granularity</span>
              <div class="uv-gran-row" id="uvGranRow">
                <button class="uv-gran-btn active" data-gran="auto" onclick="App.uvSetGran('auto')">Auto</button>
                <button class="uv-gran-btn" data-gran="day" onclick="App.uvSetGran('day')">Day</button>
                <button class="uv-gran-btn" data-gran="week" onclick="App.uvSetGran('week')">Week</button>
                <button class="uv-gran-btn" data-gran="month" onclick="App.uvSetGran('month')">Month</button>
              </div>
            </div>
 
            <div class="uv-block">
              <span class="uv-block-title">Acuity (ESI) Filter</span>
              <div class="uv-esi-row" id="uvEsiRow">
                <label><input type="checkbox" id="uvEsiRed" checked onchange="App.renderUnitVolumeChart()"> Cat 1 🔴</label>
                <label><input type="checkbox" id="uvEsiOrange" checked onchange="App.renderUnitVolumeChart()"> Cat 2/3 🟠</label>
                <label><input type="checkbox" id="uvEsiGreen" checked onchange="App.renderUnitVolumeChart()"> Cat 4/5 🟢</label>
                <label><input type="checkbox" id="uvEsiUnknown" checked onchange="App.renderUnitVolumeChart()"> Unknown ⚪</label>
              </div>
            </div>
 
            <div class="uv-block uv-date-row">
              <span class="uv-block-title">Date Range</span>
              <div class="uv-date-picker-row">
                <div class="uv-date-field">
                  <label for="uvDatePickerLo">From</label>
                  <input type="date" id="uvDatePickerLo" onchange="App.uvOnDatePickerChange()">
                </div>
                <span class="uv-date-separator">→</span>
                <div class="uv-date-field">
                  <label for="uvDatePickerHi">To</label>
                  <input type="date" id="uvDatePickerHi" onchange="App.uvOnDatePickerChange()">
                </div>
              </div>
            </div>
          </div>
 
          <div class="er-chart-canvas-wrap" style="height: 380px;">
            <canvas id="mscoe-unit-volume"></canvas>
          </div>
          <div class="er-chart-footnote">
            Line graph of timed ER check-ins. Click on any line point to drill down: <b>Brigade → Battalion → Company</b>. Use the breadcrumbs to navigate back up.
          </div>
          <div class="er-chart-insight" id="mscoeUnitVolumeInsight"></div>
        </div>
 
        <!-- Table Panel -->
        <div class="er-chart-panel" style="margin-top: 1.5rem;">
          <div class="er-chart-panel-header">
            <h3>All Trainee Check-Ins (Filtered)</h3>
          </div>
          <div style="overflow-x: auto; max-height: 400px; border: 1px solid var(--border-subtle); border-radius: 4px;">
            <table class="dccs-trainee-table" id="patientTable" style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.8rem; font-family: var(--font-body);">
              <thead>
                <tr style="background: var(--bg-secondary); border-bottom: 2px solid var(--border-subtle); color: var(--text-primary); font-weight: 700;">
                  <th style="padding: 10px 12px;">Date</th>
                  <th style="padding: 10px 12px;">Hour Block</th>
                  <th style="padding: 10px 12px; text-align: center;">Trainees</th>
                  <th style="padding: 10px 12px;">Company</th>
                  <th style="padding: 10px 12px;">Battalion</th>
                  <th style="padding: 10px 12px;">Brigade</th>
                  <th style="padding: 10px 12px;">Acuity</th>
                  <th style="padding: 10px 12px;">ER Usage & Impact</th>
                </tr>
              </thead>
              <tbody id="patientTableBody"></tbody>
            </table>
          </div>
        </div>
      </section>
    `;
  },
 
  renderUnitVolumeChart(prefix) {
    this.uvRenderBreadcrumb();
    const p = prefix || '';
    const chartId = p + 'mscoe-unit-volume';
    this._destroyErChart(chartId);
 
    const canvas = document.getElementById(chartId);
    if (!canvas) return;
 
    if (!this.uvDateList.length) {
      const insight = document.getElementById(p + 'mscoeUnitVolumeInsight');
      if (insight) insight.innerHTML = 'No dated trainee visits loaded.';
      return;
    }
 
    const loTs = this.uvDateList[this.uvState.loIdx];
    const hiTs = this.uvDateList[this.uvState.hiIdx];
    const spanDays = Math.round((hiTs - loTs) / (24*60*60*1000)) + 1;
    const gran = this.uvEffectiveGran(spanDays);
    const esi = this.uvActiveEsi();
 
    // Filter patients
    const filtered = this.allPatients.filter(pat => {
      if (!pat.time || !pat.date) return false;
      const dts = new Date(pat.date.getFullYear(), pat.date.getMonth(), pat.date.getDate()).getTime();
      if (dts < loTs || dts > hiTs) return false;
      if (!this.uvAcuityPasses(pat.acuity, esi)) return false;
      // drill scoping
      if (this.uvState.level === 'bn'  && pat.bde !== this.uvState.bde) return false;
      if (this.uvState.level === 'co'  && pat.bde !== this.uvState.bde) return false;
      if (this.uvState.level === 'co'  && (pat.battalion||'') !== this.uvState.bn) return false;
      return true;
    });
 
    // Grouping key
    const groupOf = (pat) => {
      if (this.uvState.level === 'bde') return pat.bde || 'Other Units';
      if (this.uvState.level === 'bn')  return pat.battalion ? ('BN ' + pat.battalion) : 'BN (unknown)';
      return pat.company ? ('Co ' + pat.company) : 'Co (unknown)';
    };
 
    // Buckets
    const bucketSet = new Set();
    filtered.forEach(pat => bucketSet.add(this.uvBucketKey(pat.date, gran)));
    let c = new Date(this.uvBucketKey(new Date(loTs), gran));
    const end = new Date(this.uvBucketKey(new Date(hiTs), gran));
    while (c <= end) {
      bucketSet.add(c.getTime());
      if (gran === 'day') {
        c.setDate(c.getDate() + 1);
      } else if (gran === 'week') {
        c.setDate(c.getDate() + 7);
      } else if (gran === 'month') {
        c = new Date(c.getFullYear(), c.getMonth() + 1, 1);
      }
    }
    const buckets = Array.from(bucketSet).sort((a,b)=>a-b);
    const bucketIndex = {};
    buckets.forEach((b,i)=>bucketIndex[b]=i);
    const labels = buckets.map(b => this.uvBucketLabel(b, gran));
 
    // Groups
    let groups;
    if (this.uvState.level === 'bde') {
      groups = this.BDE_ORDER.slice();
    } else {
      const gset = new Set();
      filtered.forEach(pat => gset.add(groupOf(pat)));
      groups = Array.from(gset).sort((a,b) => {
        const na = parseInt(a.replace(/\D/g,''),10);
        const nb = parseInt(b.replace(/\D/g,''),10);
        if (!isNaN(na) && !isNaN(nb) && na!==nb) return na-nb;
        return a.localeCompare(b);
      });
    }
 
    const seriesMap = {};
    groups.forEach(g => seriesMap[g] = new Array(buckets.length).fill(0));
    filtered.forEach(pat => {
      const g = groupOf(pat);
      if (!(g in seriesMap)) return;
      const bi = bucketIndex[this.uvBucketKey(pat.date, gran)];
      if (bi !== undefined) seriesMap[g][bi] += (pat.count || 1);
    });
 
    const activeGroups = groups.filter(g => seriesMap[g].some(v => v > 0));
 
    // Datasets
    const datasets = activeGroups.map((g, i) => {
      const color = this.UV_PALETTE[i % this.UV_PALETTE.length];
      return {
        label:           g,
        data:            seriesMap[g],
        borderColor:     color,
        backgroundColor: color + '33',
        tension:         0.25,
        pointRadius:     buckets.length > 40 ? 0 : 3,
        pointHoverRadius:5,
        borderWidth:     2,
        fill:            false,
        uvGroup:         g,
      };
    });
 
    const granLabel = gran.charAt(0).toUpperCase()+gran.slice(1);
 
    try {
      if (typeof Chart === 'undefined') {
        throw new ReferenceError("Chart is undefined");
      }
      this._erCharts[chartId] = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: { labels, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode:'index', intersect:false },
          onClick: (evt, elements, chart) => {
            if (this.uvState.level === 'co') return;
            if (!elements || !elements.length) return;
            const dsIdx = elements[0].datasetIndex;
            const g = chart.data.datasets[dsIdx].uvGroup;
            if (this.uvState.level === 'bde') {
              this.uvGoBn(g);
            } else if (this.uvState.level === 'bn') {
              const num = g.replace(/\D/g,'');
              if (num) this.uvGoCo(num);
            }
          },
          plugins: {
            legend: { position: 'bottom', labels: { color: 'var(--text-primary)' } },
            title: {
              display: true,
              color: 'var(--text-primary)',
              text: `${this.uvState.level==='bde'?'Brigades':this.uvState.level==='bn'?('Battalions in '+this.uvState.bde):('Companies in BN '+this.uvState.bn)} — ${granLabel} buckets — ${spanDays} day window`
            },
            tooltip: {
              callbacks: {
                footer: () => this.uvState.level==='co' ? '' : 'Click a point to drill down',
              }
            }
          },
          scales: {
            x: { title:{display:true,text:'Date',color:'var(--text-muted)'}, grid:{color:'rgba(0,0,0,0.06)'}, ticks:{maxRotation:60,autoSkip:true,maxTicksLimit:24,color:'var(--text-muted)'} },
            y: { beginAtZero:true, title:{display:true,text:'ER Check-Ins',color:'var(--text-muted)'}, grid:{color:'rgba(0,0,0,0.06)'}, ticks:{stepSize:1,color:'var(--text-muted)'} }
          }
        }
      });
    } catch (err) {
      console.error("DCCS MSCoE Unit Volume chart creation error:", err);
      const insight = document.getElementById(p + 'mscoeUnitVolumeInsight');
      if (insight) {
        insight.innerHTML = `<div style="color:#c1272d;background:rgba(193,39,45,0.06);padding:10px;border-left:4px solid #c1272d;margin-top:10px;font-family:monospace;"><strong>Chart Rendering Error:</strong> ${err.message}</div>`;
      }
    }
 
    const insightEl = document.getElementById(p + 'mscoeUnitVolumeInsight');
    if (insightEl && !insightEl.innerHTML.includes('Chart Rendering Error')) {
      insightEl.innerHTML = this.generateUnitVolumeInsight(filtered, activeGroups, seriesMap, spanDays, gran, esi);
    }
 
    // Update check-in table too! (Only on the standard view)
    if (p === '') {
      this.renderPatientTable(filtered);
    }
  },
 
  generateUnitVolumeInsight(filtered, groups, seriesMap, spanDays, gran, esi) {
    if (!filtered.length || !groups.length) {
      return 'No trainee check-ins match the current filters. Try widening the date range or enabling more acuity buckets.';
    }
    const total = filtered.reduce((sum, p) => sum + (p.count || 1), 0);
 
    const allOn = esi.red && esi.orange && esi.green && esi.unknown;
    let esiDesc;
    if (allOn) esiDesc = 'all acuities';
    else {
      const on = [];
      if (esi.red) on.push('Cat 1');
      if (esi.orange) on.push('Cat 2/3');
      if (esi.green) on.push('Cat 4/5');
      if (esi.unknown) on.push('Unknown');
      esiDesc = on.length ? on.join(' + ') : 'no acuities (nothing selected)';
    }
 
    const ranked = groups.map(g => ({
      name: g,
      total: seriesMap[g].reduce((a,b)=>a+b,0)
    })).sort((a,b)=>b.total-a.total);
 
    const levelWord = this.uvState.level==='bde' ? 'brigade' : this.uvState.level==='bn' ? 'battalion' : 'company';
    const scopeWord = this.uvState.level==='bde' ? 'across all brigades'
                     : this.uvState.level==='bn' ? `within ${this.uvState.bde}`
                     : `within BN ${this.uvState.bn}`;
 
    const top = ranked[0];
    const topPct = Math.round((top.total/total)*100);
 
    const topList = ranked.slice(0, Math.min(3, ranked.length))
      .map(r => `<strong>${this.escapeHtml(r.name)}</strong> (${r.total}, ${Math.round((r.total/total)*100)}%)`)
      .join(', ');
 
    const s1 = `Over a <strong>${spanDays}-day</strong> window (${gran} buckets, ${esiDesc}), <strong>${total}</strong> timed ER check-ins ${scopeWord} are spread over <strong>${ranked.length} ${levelWord}${ranked.length>1?'s':''}</strong>. Top ${Math.min(3,ranked.length)}: ${topList}.`;
 
    let s2;
    if (this.uvState.level === 'co') {
      s2 = `The leading company drives <strong>${topPct}%</strong> of this battalion's ER load in the window. Use the breadcrumb to step back up to battalion or brigade view.`;
    } else {
      s2 = `<strong>${this.escapeHtml(top.name)}</strong> leads with <strong>${topPct}%</strong> of the load — click its line in the chart to drill into the next level.`;
    }
    return s1 + ' ' + s2;
  },
 
  renderPatientTable(filtered) {
    const tableBody = document.getElementById('patientTableBody');
    if (!tableBody) return;
 
    if (!filtered || !filtered.length) {
      tableBody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:2rem 0;color:var(--text-muted);font-style:italic;">No check-ins match current filters.</td></tr>`;
      return;
    }
 
    const colorMap = {
      red:     'rgba(193, 39, 45, 0.08)',
      orange:  'rgba(230, 149, 0, 0.08)',
      green:   'rgba(46, 139, 46, 0.08)',
      unknown: 'rgba(0, 0, 0, 0.02)'
    };
    const labelMap = {
      red:     'Cat 1 🔴',
      orange:  'Cat 2/3 🟠',
      green:   'Cat 4/5 🟢',
      unknown: 'Unknown ⚪'
    };
 
    const getERUsageHtml = (acuity, count) => {
      const c = count || 1;
      if (acuity === 'red') {
        return '<span class="dccs-badge badge-emergent">Appropriate (Emergent)</span>';
      }
      if (acuity === 'orange') {
        return '<span class="dccs-badge badge-urgent">Appropriate (Urgent)</span>';
      }
      if (acuity === 'green') {
        if (c >= 3) {
          return '<span class="dccs-badge badge-inappropriate-high">Inappropriate (High ER Impact)</span>';
        }
        return '<span class="dccs-badge badge-inappropriate-low">Inappropriate (Low Acuity)</span>';
      }
      return '<span class="dccs-badge badge-unknown">Unknown</span>';
    };
 
    const fmtDate = (d) => {
      return (d.getMonth() + 1).toString().padStart(2, '0') + '/' +
             d.getDate().toString().padStart(2, '0') + '/' + d.getFullYear();
    };
 
    tableBody.innerHTML = filtered.map(p => `
      <tr style="background:${colorMap[p.acuity] || 'transparent'}; border-bottom: 1px solid var(--border-subtle); color: var(--text-primary);">
        <td style="padding:8px 12px;">${fmtDate(p.date)}</td>
        <td style="padding:8px 12px;">${this.escapeHtml(p.timeStr || '')}</td>
        <td style="padding:8px 12px; text-align:center; font-weight:700;">${p.count || 1}</td>
        <td style="padding:8px 12px;">${this.escapeHtml(p.company || '')}</td>
        <td style="padding:8px 12px;">BN ${this.escapeHtml(p.battalion || '')}</td>
        <td style="padding:8px 12px;">${this.escapeHtml(p.bde || '')}</td>
        <td style="padding:8px 12px; font-weight:500;">${labelMap[p.acuity] || 'Unknown'}</td>
        <td style="padding:8px 12px;">${getERUsageHtml(p.acuity, p.count)}</td>
      </tr>
    `).join('');
  },
 
  initMscoeChartsAndTables() {
    const store = this.getMetricStore();
    this.allPatients = (store['er-patients'] || []).map(p => ({ ...p, date: this.parseLocalDate(p.date) }));
 
    this.uvState = {
      level:    'bde',
      bde:      null,
      bn:       null,
      gran:     'auto',
      loIdx:    null,
      hiIdx:    null,
    };
 
    this.uvBuildDatePickers();
    this.renderUnitVolumeChart();
  },
  });
}());
