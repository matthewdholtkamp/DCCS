// DCCS Operational Framework - Metric storage, charts, forms, tables, and expanded panels
(function () {
  window.App = window.App || {};
  Object.assign(window.App, {
  // ===== TRACKED METRICS (line graph + data entry) =====
  getMetricStore() {
    return Sync.getMetricStore();
  },

  saveMetricStore(all) {
    Sync.saveMetricStore(all);
  },

  getMetricDefinition(metricId) {
    for (const sl of FRAMEWORK.serviceLines) {
      const metric = sl.trackedMetrics?.find(m => m.id === metricId);
      if (metric) return metric;
      for (const group of sl.metricGroups || []) {
        const series = group.series?.find(s => s.id === metricId);
        if (series) return { ...series, period: group.period, groupId: group.id };
      }
    }
    return null;
  },

  getMetricGroupDefinition(groupId) {
    for (const sl of FRAMEWORK.serviceLines) {
      const group = sl.metricGroups?.find(g => g.id === groupId);
      if (group) return { group, serviceLine: sl };
    }
    return null;
  },

  getMetricGroupForSeries(metricId) {
    for (const sl of FRAMEWORK.serviceLines) {
      const group = sl.metricGroups?.find(g => g.series?.some(s => s.id === metricId));
      if (group) return { group, serviceLine: sl };
    }
    return null;
  },

  getMetricEntries(metricId) {
    const all = this.getMetricStore();
    return all[metricId] || [];
  },

  metricIsMonthlySingle(metric) {
    return metric?.entryMode === 'monthly-single';
  },

  metricUsesReportAggregation(metric) {
    return metric?.aggregation === 'monthly-sum';
  },

  getMetricDisplayEntries(metricOrId, rawEntries) {
    const metric = typeof metricOrId === 'string' ? this.getMetricDefinition(metricOrId) : metricOrId;
    if (!metric) return [];
    const entries = Array.isArray(rawEntries) ? [...rawEntries] : [...this.getMetricEntries(metric.id)];
    entries.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
    if (this.metricIsMonthlySingle(metric)) {
      return entries.map(entry => {
        const monthKey = this.metricMonthKey(entry.date);
        return {
          ...entry,
          date: monthKey ? `${monthKey}-01` : entry.date,
          label: monthKey ? this.metricMonthLabel(monthKey) : entry.date
        };
      });
    }
    if (!this.metricUsesReportAggregation(metric)) return entries;
    return this.aggregateMetricEntriesByMonth(entries);
  },

  aggregateMetricEntriesByMonth(entries) {
    const buckets = new Map();
    entries.forEach(entry => {
      const key = this.metricMonthKey(entry.date);
      const value = Number(entry.value);
      if (!key || !Number.isFinite(value)) return;
      if (!buckets.has(key)) {
        buckets.set(key, {
          date: key,
          label: this.metricMonthLabel(key),
          value: 0,
          sourceEntries: []
        });
      }
      const bucket = buckets.get(key);
      bucket.value += value;
      bucket.sourceEntries.push(entry);
    });
    return Array.from(buckets.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(bucket => ({
        ...bucket,
        value: Math.round(bucket.value * 10) / 10,
        sourceCount: bucket.sourceEntries.length
      }));
  },

  metricMonthKey(dateValue) {
    const raw = String(dateValue || '').trim();
    if (/^\d{4}-\d{2}/.test(raw)) return raw.slice(0, 7);
    const parsed = this.parseLocalDate(raw);
    if (!parsed || isNaN(parsed.getTime())) return null;
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  },

  metricMonthLabel(monthKey) {
    const match = /^(\d{4})-(\d{2})$/.exec(String(monthKey || ''));
    if (!match) return monthKey || '';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[Number(match[2]) - 1]} ${match[1]}`;
  },

  metricHumanDateLabel(dateValue) {
    const parsed = this.parseLocalDate(dateValue);
    if (!parsed || Number.isNaN(parsed.getTime())) return String(dateValue || '');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${parsed.getDate()} ${months[parsed.getMonth()]} ${parsed.getFullYear()}`;
  },

  metricDeleteDateLabel(metric, dateValue) {
    if (this.metricIsMonthlySingle(metric)) {
      const monthKey = this.metricMonthKey(dateValue);
      return monthKey ? this.metricMonthLabel(monthKey) : String(dateValue || '');
    }
    return this.metricHumanDateLabel(dateValue);
  },

  metricEntryDateLabel(entry) {
    return entry?.label || entry?.date || '';
  },

  metricDateInputLabel(metric) {
    if (this.metricUsesReportAggregation(metric)) return 'Referral Date';
    return this.metricPeriodLabel(metric);
  },

  metricDateColumnLabel(metric) {
    return this.metricUsesReportAggregation(metric) || this.metricIsMonthlySingle(metric) ? 'Month' : 'Date';
  },

  metricHistorySummaryText(metric, entries) {
    if (this.metricUsesReportAggregation(metric)) {
      return `Monthly totals (${entries.length} ${entries.length === 1 ? 'month' : 'months'})`;
    }
    if (this.metricIsMonthlySingle(metric)) {
      return `Monthly values (${entries.length} ${entries.length === 1 ? 'month' : 'months'})`;
    }
    return `Data log (${entries.length} ${entries.length === 1 ? 'entry' : 'entries'})`;
  },

  metricExpandedCountText(metric, entries) {
    if (this.metricUsesReportAggregation(metric)) {
      return `${entries.length} ${entries.length === 1 ? 'month' : 'months'} reported`;
    }
    if (this.metricIsMonthlySingle(metric)) {
      return `${entries.length} ${entries.length === 1 ? 'month' : 'months'} saved`;
    }
    return `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} saved`;
  },

  metricCanonicalEntryDate(metric, dateValue) {
    if (!this.metricIsMonthlySingle(metric)) return String(dateValue || '');
    const monthKey = this.metricMonthKey(dateValue);
    return monthKey ? `${monthKey}-01` : '';
  },

  metricInputType(metric) {
    return this.metricIsMonthlySingle(metric) ? 'month' : 'date';
  },

  metricInputDefaultValue(metric) {
    const today = this.getLocalToday();
    return this.metricIsMonthlySingle(metric) ? today.slice(0, 7) : today;
  },

  metricInputStep(metric) {
    return Number.isInteger(metric?.precision) ? String(1 / Math.pow(10, metric.precision)) : 'any';
  },

  metricValueIsValid(metric, value) {
    if (value === null || value === undefined || String(value).trim() === '') return false;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return false;
    if (metric?.min !== null && metric?.min !== undefined && numeric < Number(metric.min)) return false;
    return true;
  },

  metricNormalizedValue(metric, value) {
    const numeric = Number(value);
    if (!Number.isInteger(metric?.precision)) return numeric;
    const factor = Math.pow(10, metric.precision);
    return Math.round((numeric + Number.EPSILON) * factor) / factor;
  },

  saveMetricEntryToStore(all, metric, rawDate, value, by, options = {}) {
    if (!metric || !this.metricValueIsValid(metric, value)) return null;
    const date = this.metricCanonicalEntryDate(metric, rawDate);
    if (!date) return null;

    const entries = Array.isArray(all[metric.id]) ? [...all[metric.id]] : [];
    const replaceExactDate = options.replaceExactDate === true;
    const existingIndex = this.metricIsMonthlySingle(metric)
      ? entries.findIndex(entry => this.metricMonthKey(entry.date) === this.metricMonthKey(date))
      : replaceExactDate
        ? entries.findIndex(entry => entry.date === date)
        : -1;
    const beforeEntry = existingIndex >= 0 ? { ...entries[existingIndex] } : null;
    const nextEntry = { date, value: this.metricNormalizedValue(metric, value), by };

    if (existingIndex >= 0) entries[existingIndex] = nextEntry;
    else entries.push(nextEntry);

    entries.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
    all[metric.id] = entries;
    return { date, beforeEntry, nextEntry, replaced: existingIndex >= 0 };
  },

  addMetricEntry(metricId) {
    const valInput = document.getElementById(`metric-val-${metricId}`);
    const dateInput = document.getElementById(`metric-date-${metricId}`);
    const metric = this.getMetricDefinition(metricId);
    if (!valInput || !metric) return;
    
    valInput.classList.remove('input-error');
    if (dateInput) dateInput.classList.remove('input-error');
    
    let hasError = false;
    if (!dateInput || !dateInput.value) {
      if (dateInput) dateInput.classList.add('input-error');
      hasError = true;
    }
    
    const parsedVal = Number(valInput.value);
    if (valInput.value === '' || !this.metricValueIsValid(metric, parsedVal)) {
      valInput.classList.add('input-error');
      hasError = true;
    }
    
    if (hasError) return;
    
    const all = { ...this.getMetricStore() };
    const user = this.getCurrentUser();
    const saved = this.saveMetricEntryToStore(all, metric, dateInput.value, parsedVal, user);
    if (!saved) {
      dateInput.classList.add('input-error');
      return;
    }

    Sync.saveMetricSeries([metricId], all);
    valInput.value = '';
    
    // P2: Show save confirmation flash
    valInput.style.boxShadow = '0 0 0 2px rgba(122,172,106,0.5)';
    setTimeout(() => { valInput.style.boxShadow = ''; }, 800);
    this.refreshMetricDisplay(metricId);
    
    const beforeValue = saved.beforeEntry ? saved.beforeEntry.value : 'None';
    const savedValue = saved.nextEntry.value;
    this.logAudit('update_metric', metricId, `${metricId} on ${saved.date}: ${beforeValue}`, `${metricId} on ${saved.date}: ${savedValue}`);
    this.showUndoToast(`${saved.replaced ? 'Updated' : 'Added'} ${metric.name} = ${this.formatMetricNumber(savedValue, metric.precision)}`, () => {
      const undoAll = { ...this.getMetricStore() };
      const undoEntries = Array.isArray(undoAll[metricId]) ? [...undoAll[metricId]] : [];
      const idx = this.metricIsMonthlySingle(metric)
        ? undoEntries.findIndex(e => this.metricMonthKey(e.date) === this.metricMonthKey(saved.date))
        : undoEntries.findIndex(e => e.date === saved.date && e.value === savedValue);
      if (idx >= 0) {
        if (saved.beforeEntry) undoEntries[idx] = saved.beforeEntry;
        else undoEntries.splice(idx, 1);
        undoAll[metricId] = undoEntries;
        Sync.saveMetricSeries([metricId], undoAll);
        this.refreshMetricDisplay(metricId);
        this.logAudit('undo_metric', metricId, `${metricId} on ${saved.date}: ${savedValue}`, `${metricId} on ${saved.date}: ${beforeValue}`);
      }
    });
  },

  drawMiniChart(metricId) {
    const chart = document.getElementById(`chart-${metricId}`);
    const metric = this.getMetricDefinition(metricId);
    if (!chart || !metric) return;
    const entries = this.getMetricDisplayEntries(metric);
    chart.innerHTML = this.renderMetricChart(metric, entries);
  },

  addMetricGroupEntry(groupId) {
    const found = this.getMetricGroupDefinition(groupId);
    if (!found) return;
    const { group } = found;
    const dateInput = document.getElementById(`metric-group-date-${group.id}`);
    
    if (dateInput) dateInput.classList.remove('input-error');
    
    let dateHasError = false;
    if (!dateInput || !dateInput.value) {
      if (dateInput) dateInput.classList.add('input-error');
      dateHasError = true;
    }
    
    let hasValues = false;
    let valueHasError = false;
    const inputs = [];
    
    group.series.forEach(series => {
      const input = document.getElementById(`metric-group-val-${group.id}-${series.id}`);
      if (input) {
        input.classList.remove('input-error');
        inputs.push({ series, input });
        if (input.value !== '') {
          const parsed = parseFloat(input.value);
          if (isNaN(parsed)) {
            input.classList.add('input-error');
            valueHasError = true;
          } else {
            hasValues = true;
          }
        }
      }
    });
    
    // If no values were entered at all, mark all empty series inputs as errors
    if (!hasValues && !valueHasError) {
      inputs.forEach(({ input }) => {
        input.classList.add('input-error');
      });
      valueHasError = true;
    }
    
    if (dateHasError || valueHasError) return;
    
    const date = dateInput.value;
    const all = { ...this.getMetricStore() };
    const beforeState = {};
    let added = false;
    const changedIds = [];
    const user = this.getCurrentUser();
    
    group.series.forEach(series => {
      const input = document.getElementById(`metric-group-val-${group.id}-${series.id}`);
      if (!input || input.value === '') return;
      const entries = Array.isArray(all[series.id]) ? [...all[series.id]] : [];
      beforeState[series.id] = Array.isArray(all[series.id]) ? [...all[series.id]] : null;
      
      entries.push({ date, value: parseFloat(input.value), by: user });
      entries.sort((a, b) => a.date.localeCompare(b.date));
      all[series.id] = entries;
      input.value = '';
      added = true;
      changedIds.push(series.id);
      
      this.logAudit('update_metric', series.id, `${series.id} on ${date}: None`, `${series.id} on ${date}: ${parseFloat(input.value)}`);
    });
    
    if (!added) return;
    Sync.saveMetricSeries(changedIds, all);
    this.refreshMetricGroupDisplay(group.id);

    this.showUndoToast(`Added ${changedIds.length} metrics`, () => {
      const undoAll = { ...this.getMetricStore() };
      changedIds.forEach(seriesId => {
        if (beforeState[seriesId] === null) {
          delete undoAll[seriesId];
        } else {
          undoAll[seriesId] = beforeState[seriesId];
        }
        this.logAudit('undo_metric', seriesId, `${seriesId} on ${date}: restored previous state`, `${seriesId} on ${date}: removed new value`);
      });
      Sync.saveMetricSeries(changedIds, undoAll);
      this.refreshMetricGroupDisplay(group.id);
    });
  },

  drawMetricGroupChart(groupId) {
    const found = this.getMetricGroupDefinition(groupId);
    const chart = document.getElementById(`chart-group-${groupId}`);
    if (!found || !chart) return;
    chart.innerHTML = this.renderMetricGroupChart(found.group);
  },

  formatMetricNumber(value, precision = null) {
    if (!Number.isFinite(Number(value))) return '0';
    if (Number.isInteger(precision) && precision >= 0) {
      return Number(value).toFixed(precision);
    }
    const rounded = Math.round(Number(value) * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  },

  metricUnitLabel(metric, value) {
    const unit = metric.unit || 'count';
    if (Number(value) !== 1) return unit;
    if (unit.endsWith('ies')) return `${unit.slice(0, -3)}y`;
    if (unit.endsWith('s')) return unit.slice(0, -1);
    return unit;
  },

  formatMetricValue(metric, value) {
    return `${this.formatMetricNumber(value, metric?.precision)} ${this.metricUnitLabel(metric, value)}`;
  },

  metricPeriodLabel(metricOrGroup) {
    if (metricOrGroup?.period === 'day') return 'Day';
    if (metricOrGroup?.period === 'month') return 'Month';
    return 'Week';
  },

  metricPeriodAdverb(metricOrGroup) {
    if (metricOrGroup?.period === 'day') return 'daily';
    if (metricOrGroup?.period === 'month') return 'monthly';
    return 'weekly';
  },

  metricTargetText(metric) {
    if (metric.goal !== null && metric.goal !== undefined) {
      const relation = metric.direction === 'lower'
        ? metric.goalInclusive ? 'at or below' : 'under'
        : metric.goalInclusive === false ? 'above' : 'at least';
      return `Goal: ${relation} ${this.formatMetricValue(metric, metric.goal)}`;
    }
    if (metric.direction === 'neutral') {
      return `Track ${this.metricPeriodAdverb(metric)} count`;
    }
    return `Track ${this.metricPeriodAdverb(metric)} volume (${metric.direction} is better)`;
  },

  metricLatestText(metric, entries) {
    if (!entries.length) return 'No entries yet';
    const latest = entries[entries.length - 1];
    return this.formatMetricValue(metric, latest.value);
  },

  metricMeetsGoal(metric, value) {
    if (metric?.goal === null || metric?.goal === undefined) return null;
    const numeric = Number(value);
    const goal = Number(metric.goal);
    if (!Number.isFinite(numeric) || !Number.isFinite(goal)) return null;
    if (metric.direction === 'lower') return metric.goalInclusive ? numeric <= goal : numeric < goal;
    if (metric.direction === 'higher') return metric.goalInclusive === false ? numeric > goal : numeric >= goal;
    return null;
  },

  metricGoalSymbol(metric) {
    if (metric?.direction === 'lower') return metric.goalInclusive ? '≤' : '<';
    if (metric?.direction === 'higher') return metric.goalInclusive === false ? '>' : '≥';
    return '';
  },

  metricStatus(metric, entries) {
    if (!entries.length) return { label: 'Awaiting first entry', tone: 'neutral' };
    if (metric.goal === null || metric.goal === undefined) {
      return { label: metric.direction === 'neutral' ? `Tracking ${this.metricPeriodAdverb(metric)} count` : `Tracking ${this.metricPeriodAdverb(metric)} volume`, tone: 'neutral' };
    }

    const latest = entries[entries.length - 1].value;
    const meetsGoal = this.metricMeetsGoal(metric, latest);
    if (meetsGoal) return { label: 'Meets goal', tone: 'good' };
    return { label: metric.direction === 'lower' ? 'Above goal' : 'Below goal', tone: 'warn' };
  },

  metricTrend(metric, entries) {
    if (entries.length < 2) {
      const period = this.metricPeriodLabel(metric).toLowerCase();
      return { label: `Need 2 ${period}s for trend`, tone: 'neutral' };
    }
    const previous = entries[entries.length - 2].value;
    const latest = entries[entries.length - 1].value;
    const precision = Number.isInteger(metric?.precision) ? metric.precision : 1;
    const factor = Math.pow(10, precision);
    const delta = Math.round((latest - previous) * factor) / factor;
    if (delta === 0) return { label: 'Stable from last entry', tone: 'neutral' };

    if (metric.direction === 'neutral') {
      return {
        label: `${delta > 0 ? 'Up' : 'Down'} ${this.formatMetricValue(metric, Math.abs(delta))}`,
        tone: 'neutral'
      };
    }

    const improving = metric.direction === 'lower' ? delta < 0 : delta > 0;
    const directionLabel = delta > 0 ? 'up' : 'down';
    return {
      label: `${improving ? 'Improving' : 'Watch'}: ${directionLabel} ${this.formatMetricValue(metric, Math.abs(delta))}`,
      tone: improving ? 'good' : 'warn'
    };
  },

  renderMetricBadge(text, tone) {
    return `<span class="metric-badge ${tone}">${this.escapeHtml(text)}</span>`;
  },

  metricChartAxisTitles(metricOrGroup) {
    const period = metricOrGroup?.period;
    const x = period === 'month' ? 'Month' : period === 'day' ? 'Date' : 'Week';
    const y = metricOrGroup?.unit || 'Value';
    return { x, y };
  },

  metricChartNiceNumber(range, round) {
    if (!Number.isFinite(range) || range <= 0) return 1;
    const exponent = Math.floor(Math.log10(range));
    const fraction = range / Math.pow(10, exponent);
    let niceFraction = 1;

    if (round) {
      if (fraction < 1.5) niceFraction = 1;
      else if (fraction < 3) niceFraction = 2;
      else if (fraction < 7) niceFraction = 5;
      else niceFraction = 10;
    } else {
      if (fraction <= 1) niceFraction = 1;
      else if (fraction <= 2) niceFraction = 2;
      else if (fraction <= 5) niceFraction = 5;
      else niceFraction = 10;
    }

    return niceFraction * Math.pow(10, exponent);
  },

  metricChartScale(values, options = {}) {
    const finiteValues = values.map(Number).filter(Number.isFinite);
    const referenceValue = Number(options.referenceValue);
    if (Number.isFinite(referenceValue)) finiteValues.push(referenceValue);
    if (!finiteValues.length) finiteValues.push(0, 1);

    let rawMin = Math.min(...finiteValues);
    let rawMax = Math.max(...finiteValues);
    if (rawMin === rawMax) {
      const pad = Math.max(Math.abs(rawMax) * 0.2, 1);
      rawMin -= pad;
      rawMax += pad;
    }

    const forceZero = options.forceZero ?? rawMin >= 0;
    if (forceZero) rawMin = Math.min(0, rawMin);

    const tickCount = options.tickCount || 4;
    const niceRange = this.metricChartNiceNumber(rawMax - rawMin, false);
    const step = this.metricChartNiceNumber(niceRange / Math.max(tickCount - 1, 1), true);
    const min = forceZero ? 0 : Math.floor(rawMin / step) * step;
    let max = Math.ceil(rawMax / step) * step;
    if (max <= min) max = min + step * Math.max(tickCount - 1, 1);

    const ticks = [];
    for (let value = min, guard = 0; value <= max + step * 0.25 && guard < 10; value += step, guard++) {
      ticks.push(Number(value.toFixed(6)));
    }
    if (ticks[ticks.length - 1] < max) ticks.push(max);

    return { min, max, ticks };
  },

  metricChartDateTicks(labels, maxTicks) {
    if (!labels.length) return [];
    if (labels.length <= maxTicks) {
      return labels.map((label, index) => ({ label, index }));
    }

    const last = labels.length - 1;
    const indexes = new Set([0, last]);
    for (let i = 1; i < maxTicks - 1; i++) {
      indexes.add(Math.round((last * i) / (maxTicks - 1)));
    }

    return Array.from(indexes)
      .sort((a, b) => a - b)
      .map(index => ({ label: labels[index], index }));
  },

  metricChartShortDateLabel(label) {
    const raw = String(label || '');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dayMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if (dayMatch) {
      return `${months[Number(dayMatch[2]) - 1]} ${Number(dayMatch[3])}`;
    }
    if (/^\d{4}-\d{2}$/.test(raw)) {
      return this.metricMonthLabel(raw);
    }
    return raw;
  },

  metricChartYFor(value, scale, plot) {
    return plot.bottom - ((Number(value) - scale.min) / (scale.max - scale.min)) * (plot.bottom - plot.top);
  },

  renderMetricChartAxes({ width, height, plot, scale, xTicks, xForIndex, xLabel, yLabel, precision = null }) {
    const yGrid = scale.ticks.map(value => {
      const y = this.metricChartYFor(value, scale, plot);
      return `
        <line x1="${plot.left}" y1="${y.toFixed(1)}" x2="${plot.right}" y2="${y.toFixed(1)}" class="metric-chart-gridline"/>
        <text x="${plot.left - 8}" y="${y.toFixed(1)}" text-anchor="end" dominant-baseline="middle" class="metric-chart-y-tick">${this.escapeHtml(this.formatMetricNumber(value, precision))}</text>
      `;
    }).join('');

    const xGrid = xTicks.map(({ label, index }) => {
      const x = xForIndex(index);
      return `
        <line x1="${x.toFixed(1)}" y1="${plot.bottom}" x2="${x.toFixed(1)}" y2="${plot.bottom + 5}" class="metric-chart-tick"/>
        <text x="${x.toFixed(1)}" y="${plot.bottom + 18}" text-anchor="middle" class="metric-chart-x-tick">${this.escapeHtml(this.metricChartShortDateLabel(label))}</text>
      `;
    }).join('');

    const middleY = plot.top + (plot.bottom - plot.top) / 2;

    return `
      <rect x="${plot.left}" y="${plot.top}" width="${plot.right - plot.left}" height="${plot.bottom - plot.top}" class="metric-chart-plot-bg"/>
      ${yGrid}
      <line x1="${plot.left}" y1="${plot.top}" x2="${plot.left}" y2="${plot.bottom}" class="metric-chart-axis-line"/>
      <line x1="${plot.left}" y1="${plot.bottom}" x2="${plot.right}" y2="${plot.bottom}" class="metric-chart-axis-line"/>
      ${xGrid}
      <text x="${plot.left + (plot.right - plot.left) / 2}" y="${height - 7}" text-anchor="middle" class="metric-chart-axis-title">${this.escapeHtml(xLabel)}</text>
      <text x="14" y="${middleY.toFixed(1)}" text-anchor="middle" class="metric-chart-axis-title metric-chart-y-title" transform="rotate(-90 14 ${middleY.toFixed(1)})">${this.escapeHtml(yLabel)}</text>
    `;
  },

  renderMetricChart(metric, entries, options = {}) {
    const variant = options.variant || 'mini';
    const isExpanded = variant === 'expanded';
    const isWide = isExpanded || metric.featured;
    const width = isWide ? 760 : 360;
    const height = isExpanded ? 310 : 190;
    const plot = {
      left: isWide ? 68 : 56,
      right: width - (isWide ? 24 : 18),
      top: isExpanded ? 18 : 16,
      bottom: height - (isExpanded ? 58 : 48)
    };
    const safeName = this.escapeHtml(metric.name);

    if (!entries.length) {
      return `
        <div class="metric-chart-empty ${isExpanded ? 'expanded' : ''}">
          <strong>No data entered</strong>
          <span>Add ${this.metricIsMonthlySingle(metric) ? 'monthly' : 'dated'} values to begin the ${this.metricPeriodAdverb(metric)} trend line.</span>
        </div>`;
    }

    if (entries.length === 1) {
      const entry = entries[0];
      return `
        <div class="metric-chart-empty ${isExpanded ? 'expanded' : ''}">
          <strong>1 ${this.metricPeriodLabel(metric).toLowerCase()} saved</strong>
          <span>${this.escapeHtml(this.metricEntryDateLabel(entry))} • ${this.escapeHtml(this.formatMetricValue(metric, entry.value))}</span>
          <span>Add one more entry to draw the line.</span>
        </div>`;
    }

    const values = entries.map(e => Number(e.value));
    const scale = this.metricChartScale(values, {
      referenceValue: metric.goal,
      tickCount: isExpanded ? 5 : 4
    });
    const labels = entries.map(entry => this.metricEntryDateLabel(entry));
    const xStep = (plot.right - plot.left) / (entries.length - 1);
    const xForIndex = index => plot.left + index * xStep;
    const yFor = value => this.metricChartYFor(value, scale, plot);
    const points = entries.map((entry, index) => ({
      x: xForIndex(index),
      y: yFor(entry.value),
      entry
    }));
    const pointString = points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const { x, y } = this.metricChartAxisTitles(metric);
    const axes = this.renderMetricChartAxes({
      width,
      height,
      plot,
      scale,
      xTicks: this.metricChartDateTicks(labels, isExpanded ? 5 : metric.featured ? 4 : 3),
      xForIndex,
      xLabel: x,
      yLabel: y,
      precision: metric.precision
    });
    const goalLine = metric.goal !== null && metric.goal !== undefined ? (() => {
      const y = yFor(metric.goal);
      return `
        <line x1="${plot.left}" y1="${y.toFixed(1)}" x2="${plot.right}" y2="${y.toFixed(1)}" class="metric-chart-goal"/>
        ${isExpanded ? `<text x="${plot.right}" y="${Math.max(14, y - 8).toFixed(1)}" text-anchor="end" class="metric-chart-goal-label">Goal ${this.escapeHtml(this.formatMetricValue(metric, metric.goal))}</text>` : ''}
      `;
    })() : '';
    const circles = points.map(p => `
      <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${isExpanded ? 4.5 : 3.5}" class="metric-chart-point"></circle>
      <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="12" fill="transparent" style="cursor: pointer;"
        onmouseenter="App.showTooltip(event, '${this.escapeHtml(this.metricEntryDateLabel(p.entry))}', '${this.escapeHtml(this.formatMetricValue(metric, p.entry.value))}')"
        onmouseleave="App.hideTooltip()"
        onmousemove="App.showTooltip(event, '${this.escapeHtml(this.metricEntryDateLabel(p.entry))}', '${this.escapeHtml(this.formatMetricValue(metric, p.entry.value))}')">
      </circle>
    `).join('');

    return `
      <svg class="metric-line-chart ${isExpanded ? 'expanded' : ''}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${safeName} trend chart" preserveAspectRatio="none">
        ${axes}
        ${goalLine}
        <polyline points="${pointString}" class="metric-chart-line"/>
        ${circles}
      </svg>
      <div class="metric-chart-dates">
        <span>${this.escapeHtml(this.metricEntryDateLabel(entries[0]))}</span>
        <span>${this.escapeHtml(this.metricEntryDateLabel(entries[entries.length - 1]))}</span>
      </div>`;
  },

  metricGroupSeriesData(group) {
    return group.series.map(series => ({
      ...series,
      entries: this.getMetricDisplayEntries({ ...series, period: group.period })
    }));
  },

  metricGroupEntryCount(group) {
    return this.metricGroupSeriesData(group).reduce((sum, series) => sum + series.entries.length, 0);
  },

  metricGroupDates(group) {
    const dates = new Set();
    this.metricGroupSeriesData(group).forEach(series => {
      series.entries.forEach(entry => dates.add(entry.date));
    });
    return Array.from(dates).sort((a, b) => a.localeCompare(b));
  },

  metricGroupLatestDate(group) {
    const dates = this.metricGroupDates(group);
    return dates.length ? dates[dates.length - 1] : null;
  },

  metricSeriesLatest(series) {
    const entries = this.getMetricDisplayEntries(series);
    return entries.length ? entries[entries.length - 1] : null;
  },

  renderMetricGroupLegend(group) {
    return `
      <div class="metric-legend" aria-label="${this.escapeHtml(group.name)} legend">
        ${group.series.map(series => {
          const latest = this.metricSeriesLatest(series);
          return `
            <div class="metric-legend-item">
              <span class="metric-color-dot" style="background:${series.color};"></span>
              <span class="metric-legend-name">${this.escapeHtml(series.name)}</span>
              <strong>${latest ? this.escapeHtml(this.formatMetricValue(series, latest.value)) : 'No data'}</strong>
            </div>`;
        }).join('')}
      </div>`;
  },

  renderMetricGroupChart(group, options = {}) {
    const variant = options.variant || 'mini';
    const isExpanded = variant === 'expanded';
    const width = isExpanded ? 760 : 680;
    const height = isExpanded ? 310 : 230;
    const plot = {
      left: isExpanded ? 68 : 58,
      right: width - (isExpanded ? 24 : 22),
      top: isExpanded ? 18 : 18,
      bottom: height - (isExpanded ? 58 : 50)
    };
    const seriesData = this.metricGroupSeriesData(group);
    const dates = this.metricGroupDates(group);
    const allValues = seriesData.flatMap(series => series.entries.map(entry => Number(entry.value)));

    if (!allValues.length) {
      return `
        <div class="metric-chart-empty ${isExpanded ? 'expanded' : ''}">
          <strong>No data entered</strong>
          <span>Add ${this.metricPeriodLabel(group).toLowerCase()} values to begin the combined trend.</span>
        </div>`;
    }

    if (dates.length < 2) {
      return `
        <div class="metric-chart-empty ${isExpanded ? 'expanded' : ''}">
          <strong>${allValues.length} ${allValues.length === 1 ? 'value' : 'values'} saved</strong>
          <span>${this.escapeHtml(dates[0])}</span>
          <span>Add another ${this.metricPeriodLabel(group).toLowerCase()} to draw the combined lines.</span>
      </div>`;
    }

    const scale = this.metricChartScale(allValues, {
      tickCount: isExpanded ? 5 : 4,
      forceZero: true
    });
    const dateIndexMap = new Map(dates.map((date, index) => [date, index]));
    const xStep = (plot.right - plot.left) / (dates.length - 1);
    const xForIndex = index => plot.left + index * xStep;
    const xForDate = date => xForIndex(dateIndexMap.get(date) || 0);
    const yFor = value => this.metricChartYFor(value, scale, plot);
    const { x, y } = this.metricChartAxisTitles(group);
    const axes = this.renderMetricChartAxes({
      width,
      height,
      plot,
      scale,
      xTicks: this.metricChartDateTicks(dates, isExpanded ? 5 : 4),
      xForIndex,
      xLabel: x,
      yLabel: y
    });

    const seriesSvg = seriesData.map(series => {
      const points = series.entries.map(entry => ({
        x: xForDate(entry.date),
        y: yFor(entry.value),
        entry
      }));
      const line = points.length > 1 ? `
        <polyline points="${points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}" class="metric-chart-line" style="stroke:${series.color};"/>
      ` : '';
      const circles = points.map(point => `
        <circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="${isExpanded ? 4.5 : 3.5}" class="metric-chart-point" style="fill:${series.color};"></circle>
        <circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="12" fill="transparent" style="cursor: pointer;"
          onmouseenter="App.showTooltip(event, '${this.escapeHtml(series.name)} • ${this.escapeHtml(this.metricEntryDateLabel(point.entry))}', '${this.escapeHtml(this.formatMetricValue(series, point.entry.value))}')"
          onmouseleave="App.hideTooltip()"
          onmousemove="App.showTooltip(event, '${this.escapeHtml(series.name)} • ${this.escapeHtml(this.metricEntryDateLabel(point.entry))}', '${this.escapeHtml(this.formatMetricValue(series, point.entry.value))}')">
        </circle>
      `).join('');
      return `${line}${circles}`;
    }).join('');

    return `
      <svg class="metric-line-chart metric-multi-line-chart ${isExpanded ? 'expanded' : ''}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${this.escapeHtml(group.name)} combined trend chart" preserveAspectRatio="none">
        ${axes}
        ${seriesSvg}
      </svg>
      <div class="metric-chart-dates">
        <span>${this.escapeHtml(dates[0])}</span>
        <span>${this.escapeHtml(dates[dates.length - 1])}</span>
      </div>`;
  },

  updateMetricTable(metricId, entries) {
    const summary = document.getElementById(`metric-summary-${metricId}`);
    const metric = this.getMetricDefinition(metricId);
    if (summary && metric) summary.textContent = this.metricHistorySummaryText(metric, entries);

    const tbody = document.getElementById(`metric-tbody-${metricId}`);
    if (!tbody) return;
    tbody.innerHTML = this.renderMetricRows(metric, entries);
  },

  deleteLastMetricEntry(metricId) {
    const all = { ...this.getMetricStore() };
    const entries = Array.isArray(all[metricId]) ? [...all[metricId]] : [];
    if (entries.length === 0) return;
    entries.pop();
    all[metricId] = entries;
    Sync.saveMetricSeries([metricId], all);
    this.refreshMetricDisplay(metricId);
  },

  deleteMetricEntry(metricId, entryIndex) {
    const all = this.getMetricStore();
    const entries = all[metricId] || [];
    const entry = entries[entryIndex];
    if (!entry) return;
    const metric = this.getMetricDefinition(metricId);
    if (!metric) return;
    const dateLabel = this.metricDeleteDateLabel(metric, entry.date);
    const valueLabel = this.formatMetricValue(metric, entry.value);

    this.confirmAction({
      title: 'Delete metric entry?',
      message: 'This removes the selected point from the chart and data log. You can undo this for 8 seconds.',
      details: [
        { label: 'Metric', value: metric.name },
        { label: this.metricIsMonthlySingle(metric) ? 'Month' : 'Date', value: dateLabel },
        { label: 'Value', value: valueLabel }
      ],
      cancelLabel: 'Keep entry',
      confirmLabel: 'Delete entry',
      tone: 'danger'
    }, () => {
      const allCopy = { ...this.getMetricStore() };
      const entriesCopy = Array.isArray(allCopy[metricId]) ? [...allCopy[metricId]] : [];
      const beforeState = entriesCopy.map(item => ({ ...item }));
      const removedEntry = entriesCopy[entryIndex];
      if (!removedEntry) return;
      entriesCopy.splice(entryIndex, 1);
      allCopy[metricId] = entriesCopy;
      Sync.saveMetricSeries([metricId], allCopy);
      this.refreshMetricDisplay(metricId);
      this.logAudit(
        'delete_metric',
        metricId,
        `${metricId} on ${removedEntry.date}: ${removedEntry.value}`,
        `${metricId} on ${removedEntry.date}: Deleted`
      );

      const undoButton = this.showUndoToast(`Deleted ${dateLabel} from ${metric.name}`, () => {
        const undoAll = { ...this.getMetricStore(), [metricId]: beforeState };
        Sync.saveMetricSeries([metricId], undoAll);
        this.refreshMetricDisplay(metricId);
        this.logAudit(
          'undo_metric',
          metricId,
          `${metricId} on ${removedEntry.date}: Deleted`,
          `${metricId} on ${removedEntry.date}: ${removedEntry.value}`
        );
      });
      requestAnimationFrame(() => undoButton?.focus({ preventScroll: true }));
    });
  },

  deleteMetricMonthEntries(metricId, monthKey) {
    const metric = this.getMetricDefinition(metricId);
    if (!metric || !this.metricUsesReportAggregation(metric)) return;

    const normalizedMonth = this.metricMonthKey(monthKey);
    if (!normalizedMonth) return;

    const all = this.getMetricStore();
    const entries = Array.isArray(all[metricId]) ? [...all[metricId]] : [];
    const matchingEntries = entries.filter(entry => this.metricMonthKey(entry.date) === normalizedMonth);
    if (!matchingEntries.length) return;

    const monthLabel = this.metricMonthLabel(normalizedMonth);
    const rawEntryLabel = `${matchingEntries.length} raw ${matchingEntries.length === 1 ? 'entry' : 'entries'}`;
    const monthlyTotal = matchingEntries.reduce((sum, entry) => {
      const value = Number(entry.value);
      return Number.isFinite(value) ? sum + value : sum;
    }, 0);

    this.confirmAction({
      title: 'Delete monthly metric total?',
      message: 'This removes every source value included in this monthly total. You can undo this for 8 seconds.',
      details: [
        { label: 'Metric', value: metric.name },
        { label: 'Month', value: monthLabel },
        { label: 'Monthly total', value: this.formatMetricValue(metric, monthlyTotal) },
        { label: 'Source entries', value: rawEntryLabel }
      ],
      cancelLabel: 'Keep entries',
      confirmLabel: 'Delete entries',
      tone: 'danger'
    }, () => {
      const allCopy = { ...this.getMetricStore() };
      const entriesCopy = Array.isArray(allCopy[metricId]) ? [...allCopy[metricId]] : [];
      const beforeState = entriesCopy.map(item => ({ ...item }));
      const removedEntries = entriesCopy.filter(entry => this.metricMonthKey(entry.date) === normalizedMonth);
      if (!removedEntries.length) return;
      allCopy[metricId] = entriesCopy.filter(entry => this.metricMonthKey(entry.date) !== normalizedMonth);
      Sync.saveMetricSeries([metricId], allCopy);
      this.refreshMetricDisplay(metricId);
      this.logAudit(
        'delete_metric',
        metricId,
        `${metricId} for ${normalizedMonth}: ${removedEntries.length} source entries`,
        `${metricId} for ${normalizedMonth}: Deleted`
      );

      const undoButton = this.showUndoToast(`Deleted ${monthLabel} from ${metric.name}`, () => {
        const undoAll = { ...this.getMetricStore(), [metricId]: beforeState };
        Sync.saveMetricSeries([metricId], undoAll);
        this.refreshMetricDisplay(metricId);
        this.logAudit(
          'undo_metric',
          metricId,
          `${metricId} for ${normalizedMonth}: Deleted`,
          `${metricId} for ${normalizedMonth}: ${removedEntries.length} source entries restored`
        );
      });
      requestAnimationFrame(() => undoButton?.focus({ preventScroll: true }));
    });
  },

  deleteMetricGroupEntry(groupId, seriesId, entryIndex) {
    const found = this.getMetricGroupDefinition(groupId);
    if (!found) return;
    const series = found.group.series.find(s => s.id === seriesId);
    if (!series) return;

    const all = this.getMetricStore();
    const entries = all[series.id] || [];
    const entry = entries[entryIndex];
    if (!entry) return;
    const dateLabel = this.metricHumanDateLabel(entry.date);
    const valueLabel = this.formatMetricValue(series, entry.value);

    this.confirmAction({
      title: 'Delete metric entry?',
      message: 'This removes the selected point from the combined chart and data log. You can undo this for 8 seconds.',
      details: [
        { label: 'Metric', value: series.name },
        { label: 'Date', value: dateLabel },
        { label: 'Value', value: valueLabel }
      ],
      cancelLabel: 'Keep entry',
      confirmLabel: 'Delete entry',
      tone: 'danger'
    }, () => {
      const allCopy = { ...this.getMetricStore() };
      const entriesCopy = Array.isArray(allCopy[series.id]) ? [...allCopy[series.id]] : [];
      const beforeState = entriesCopy.map(item => ({ ...item }));
      const removedEntry = entriesCopy[entryIndex];
      if (!removedEntry) return;
      entriesCopy.splice(entryIndex, 1);
      allCopy[series.id] = entriesCopy;
      Sync.saveMetricSeries([series.id], allCopy);
      this.refreshMetricGroupDisplay(groupId);
      this.logAudit(
        'delete_metric',
        series.id,
        `${series.id} on ${removedEntry.date}: ${removedEntry.value}`,
        `${series.id} on ${removedEntry.date}: Deleted`
      );

      const undoButton = this.showUndoToast(`Deleted ${dateLabel} from ${series.name}`, () => {
        const undoAll = { ...this.getMetricStore(), [series.id]: beforeState };
        Sync.saveMetricSeries([series.id], undoAll);
        this.refreshMetricGroupDisplay(groupId);
        this.logAudit(
          'undo_metric',
          series.id,
          `${series.id} on ${removedEntry.date}: Deleted`,
          `${series.id} on ${removedEntry.date}: ${removedEntry.value}`
        );
      });
      requestAnimationFrame(() => undoButton?.focus({ preventScroll: true }));
    });
  },

  refreshMetricDisplay(metricId) {
    const metric = this.getMetricDefinition(metricId);
    if (!metric) return;
    const entries = this.getMetricDisplayEntries(metric);
    const status = this.metricStatus(metric, entries);
    const trend = this.metricTrend(metric, entries);

    const latestEl = document.getElementById(`metric-latest-${metricId}`);
    if (latestEl) latestEl.textContent = this.metricLatestText(metric, entries);

    const statusEl = document.getElementById(`metric-status-${metricId}`);
    if (statusEl) statusEl.innerHTML = this.renderMetricBadge(status.label, status.tone);

    const trendEl = document.getElementById(`metric-trend-${metricId}`);
    if (trendEl) trendEl.innerHTML = this.renderMetricBadge(trend.label, trend.tone);

    this.drawMiniChart(metricId);
    this.updateMetricTable(metricId, entries);
    this.updateExpandedMetric(metricId);
  },

  refreshMetricGroupDisplay(groupId) {
    const found = this.getMetricGroupDefinition(groupId);
    if (!found) return;
    const { group } = found;
    const count = this.metricGroupEntryCount(group);
    const latestDate = this.metricGroupLatestDate(group);

    const latestEl = document.getElementById(`metric-group-latest-${group.id}`);
    if (latestEl) latestEl.textContent = latestDate || 'No entries yet';

    const countEl = document.getElementById(`metric-group-count-${group.id}`);
    if (countEl) countEl.textContent = `${count} ${count === 1 ? 'value' : 'values'} saved`;

    const legendEl = document.getElementById(`metric-group-legend-${group.id}`);
    if (legendEl) legendEl.innerHTML = this.renderMetricGroupLegend(group);

    this.drawMetricGroupChart(group.id);

    const tbody = document.getElementById(`metric-group-tbody-${group.id}`);
    if (tbody) tbody.innerHTML = this.renderMetricGroupRows(group);

    const summary = document.getElementById(`metric-group-summary-${group.id}`);
    if (summary) summary.textContent = `Data log (${count} ${count === 1 ? 'value' : 'values'})`;

    this.updateExpandedMetricGroup(group.id);
  },

  toggleMetricExpand(metricId) {
    this.expandedMetricId = this.expandedMetricId === metricId ? null : metricId;
    this.expandedMetricGroupId = null;
    const serviceLine = FRAMEWORK.serviceLines.find(sl => sl.trackedMetrics?.some(m => m.id === metricId));
    if (!serviceLine) return;

    const panel = document.getElementById(`metrics-expanded-${serviceLine.id}`);
    if (panel) {
      panel.innerHTML = this.renderExpandedMetricContent(serviceLine);
    }

    this.updateMetricExpandButtons(serviceLine);

    if (this.expandedMetricId) {
      requestAnimationFrame(() => {
        const expanded = document.getElementById('metric-expanded-panel');
        expanded?.focus({ preventScroll: true });
        expanded?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    }
  },

  toggleMetricGroupExpand(groupId) {
    this.expandedMetricGroupId = this.expandedMetricGroupId === groupId ? null : groupId;
    this.expandedMetricId = null;
    const found = this.getMetricGroupDefinition(groupId);
    if (!found) return;
    const { serviceLine } = found;

    const panel = document.getElementById(`metrics-expanded-${serviceLine.id}`);
    if (panel) {
      panel.innerHTML = this.renderExpandedMetricContent(serviceLine);
    }

    this.updateMetricExpandButtons(serviceLine);

    if (this.expandedMetricGroupId) {
      requestAnimationFrame(() => {
        const expanded = document.getElementById('metric-expanded-panel');
        expanded?.focus({ preventScroll: true });
        expanded?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    }
  },

  updateMetricExpandButtons(serviceLine) {
    (serviceLine.trackedMetrics || []).forEach(metric => {
      const button = document.getElementById(`metric-expand-${metric.id}`);
      if (!button) return;
      const isOpen = this.expandedMetricId === metric.id;
      button.setAttribute('aria-expanded', String(isOpen));
      button.textContent = isOpen ? 'Collapse' : 'Expand';
    });

    (serviceLine.metricGroups || []).forEach(group => {
      const button = document.getElementById(`metric-group-expand-${group.id}`);
      if (!button) return;
      const isOpen = this.expandedMetricGroupId === group.id;
      button.setAttribute('aria-expanded', String(isOpen));
      button.textContent = isOpen ? 'Collapse' : 'Expand';
    });
  },

  updateExpandedMetric(metricId) {
    if (this.expandedMetricId !== metricId) return;
    const serviceLine = FRAMEWORK.serviceLines.find(sl => sl.trackedMetrics?.some(m => m.id === metricId));
    const panel = serviceLine ? document.getElementById(`metrics-expanded-${serviceLine.id}`) : null;
    if (panel) panel.innerHTML = this.renderExpandedMetricContent(serviceLine);
  },

  updateExpandedMetricGroup(groupId) {
    if (this.expandedMetricGroupId !== groupId) return;
    const found = this.getMetricGroupDefinition(groupId);
    const panel = found ? document.getElementById(`metrics-expanded-${found.serviceLine.id}`) : null;
    if (panel) panel.innerHTML = this.renderExpandedMetricContent(found.serviceLine);
  },

  renderMetricRows(metric, entries, options = {}) {
    if (!metric || !entries.length) {
      return `<tr><td class="metric-log-empty" colspan="3">No entries yet.</td></tr>`;
    }

    const isMonthlyAggregateRow = this.metricUsesReportAggregation(metric) && !options.rawEntries;
    const canDelete = options.canDelete ?? true;
    return entries.map((entry, index) => ({ entry, index })).reverse().map(({ entry, index }) => `
      <tr>
        <td>${this.escapeHtml(this.metricEntryDateLabel(entry))}</td>
        <td class="metric-log-value">${this.escapeHtml(this.formatMetricValue(metric, entry.value))}</td>
        <td class="metric-log-action">
          ${canDelete
            ? isMonthlyAggregateRow
              ? `<button class="metric-delete-btn" type="button" onclick="App.deleteMetricMonthEntries('${metric.id}', '${this.escapeHtml(entry.date)}')" aria-label="Delete all ${this.escapeHtml(this.metricEntryDateLabel(entry))} entries for ${this.escapeHtml(metric.name)}">Delete</button>`
              : `<button class="metric-delete-btn" type="button" onclick="App.deleteMetricEntry('${metric.id}', ${index})" aria-label="Delete ${this.escapeHtml(this.metricEntryDateLabel(entry))} entry for ${this.escapeHtml(metric.name)}">Delete</button>`
            : `<span class="metric-log-muted">${this.escapeHtml(entry.sourceCount ? `${entry.sourceCount} raw ${entry.sourceCount === 1 ? 'entry' : 'entries'}` : 'Monthly total')}</span>`}
        </td>
      </tr>
    `).join('');
  },

  renderMetricCard(metric) {
    const entries = this.getMetricDisplayEntries(metric);
    const status = this.metricStatus(metric, entries);
    const trend = this.metricTrend(metric, entries);
    const isExpanded = this.expandedMetricId === metric.id;

    return `
      <article class="metric-card ${metric.featured ? 'featured' : ''}" id="metric-display-${metric.id}">
        <div class="metric-card-header">
          <div>
            <h3 class="metric-title">${this.escapeHtml(metric.name)}</h3>
            <p class="metric-target">${this.escapeHtml(this.metricTargetText(metric))}</p>
          </div>
          <button class="metric-expand-btn" id="metric-expand-${metric.id}" type="button" onclick="App.toggleMetricExpand('${metric.id}')" aria-expanded="${isExpanded}" aria-controls="metrics-expanded-panel">
            ${isExpanded ? 'Collapse' : 'Expand'}
          </button>
        </div>

        <div class="metric-snapshot">
          <div>
            <span class="metric-label">Latest</span>
            <strong class="metric-latest" id="metric-latest-${metric.id}">${this.escapeHtml(this.metricLatestText(metric, entries))}</strong>
          </div>
          <div class="metric-badges">
            <span id="metric-status-${metric.id}">${this.renderMetricBadge(status.label, status.tone)}</span>
            <span id="metric-trend-${metric.id}">${this.renderMetricBadge(trend.label, trend.tone)}</span>
          </div>
        </div>

        <div class="metric-chart-shell" id="chart-${metric.id}">
          ${this.renderMetricChart(metric, entries)}
        </div>

        <form class="metric-entry-form" onsubmit="App.addMetricEntry('${metric.id}'); return false;">
          <label>
            <span>${this.escapeHtml(this.metricDateInputLabel(metric))}</span>
            <input type="${this.metricInputType(metric)}" id="metric-date-${metric.id}" value="${this.metricInputDefaultValue(metric)}">
          </label>
          <label>
            <span>Value</span>
            <input type="number" step="${this.metricInputStep(metric)}"${metric.min !== null && metric.min !== undefined ? ` min="${this.escapeHtml(metric.min)}"` : ''} id="metric-val-${metric.id}" placeholder="${this.escapeHtml(metric.unit)}">
          </label>
          <button type="submit">${this.metricIsMonthlySingle(metric) ? 'Save month' : 'Add'}</button>
        </form>

        <details class="metric-log">
          <summary id="metric-summary-${metric.id}">${this.escapeHtml(this.metricHistorySummaryText(metric, entries))}</summary>
          <div class="metric-log-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>${this.escapeHtml(this.metricDateColumnLabel(metric))}</th>
                  <th>Value</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody id="metric-tbody-${metric.id}">
                ${this.renderMetricRows(metric, entries)}
              </tbody>
            </table>
          </div>
        </details>
      </article>`;
  },

  renderMetricGroupRows(group) {
    const rows = group.series.flatMap(series => {
      return this.getMetricEntries(series.id).map((entry, index) => ({ series, entry, index }));
    }).sort((a, b) => {
      const byDate = b.entry.date.localeCompare(a.entry.date);
      if (byDate !== 0) return byDate;
      return group.series.findIndex(s => s.id === a.series.id) - group.series.findIndex(s => s.id === b.series.id);
    });

    if (!rows.length) {
      return `<tr><td class="metric-log-empty" colspan="4">No entries yet.</td></tr>`;
    }

    return rows.map(({ series, entry, index }) => `
      <tr>
        <td>${this.escapeHtml(entry.date)}</td>
        <td>
          <span class="metric-series-name">
            <span class="metric-color-dot" style="background:${series.color};"></span>
            ${this.escapeHtml(series.name)}
          </span>
        </td>
        <td class="metric-log-value">${this.escapeHtml(this.formatMetricValue(series, entry.value))}</td>
        <td class="metric-log-action">
          <button class="metric-delete-btn" type="button" onclick="App.deleteMetricGroupEntry('${group.id}', '${series.id}', ${index})" aria-label="Delete ${this.escapeHtml(entry.date)} ${this.escapeHtml(series.name)} entry">Delete</button>
        </td>
      </tr>
    `).join('');
  },

  renderMetricGroupPanel(group) {
    const count = this.metricGroupEntryCount(group);
    const latestDate = this.metricGroupLatestDate(group);
    const isExpanded = this.expandedMetricGroupId === group.id;

    return `
      <article class="metric-group-panel" id="metric-group-section-${group.id}">
        <div class="metric-card-header">
          <div>
            <h3 class="metric-title">${this.escapeHtml(group.name)}</h3>
            <p class="metric-target">${this.escapeHtml(group.description || `Track ${this.metricPeriodLabel(group).toLowerCase()} count`)}</p>
          </div>
          <button class="metric-expand-btn" id="metric-group-expand-${group.id}" type="button" onclick="App.toggleMetricGroupExpand('${group.id}')" aria-expanded="${isExpanded}" aria-controls="metrics-expanded-panel">
            ${isExpanded ? 'Collapse' : 'Expand'}
          </button>
        </div>

        <div class="metric-group-snapshot">
          <div>
            <span class="metric-label">Latest ${this.escapeHtml(this.metricPeriodLabel(group))}</span>
            <strong class="metric-latest" id="metric-group-latest-${group.id}">${this.escapeHtml(latestDate || 'No entries yet')}</strong>
          </div>
          <span class="metric-badge neutral" id="metric-group-count-${group.id}">${count} ${count === 1 ? 'value' : 'values'} saved</span>
        </div>

        <div id="metric-group-legend-${group.id}">
          ${this.renderMetricGroupLegend(group)}
        </div>

        <div class="metric-chart-shell metric-group-chart-shell" id="chart-group-${group.id}">
          ${this.renderMetricGroupChart(group)}
        </div>

        <form class="metric-group-entry-form" onsubmit="App.addMetricGroupEntry('${group.id}'); return false;">
          <label class="metric-group-date">
            <span>${this.escapeHtml(this.metricPeriodLabel(group))}</span>
            <input type="date" id="metric-group-date-${group.id}" value="${this.getLocalToday()}">
          </label>
          <div class="metric-group-series-fields">
            ${group.series.map(series => `
              <label>
                <span>${this.escapeHtml(series.name)}</span>
                <input type="number" step="any" id="metric-group-val-${group.id}-${series.id}" placeholder="${this.escapeHtml(series.unit || group.unit)}">
              </label>
            `).join('')}
          </div>
          <button type="submit">Add</button>
        </form>

        <details class="metric-log metric-group-log">
          <summary id="metric-group-summary-${group.id}">Data log (${count} ${count === 1 ? 'value' : 'values'})</summary>
          <div class="metric-log-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Series</th>
                  <th>Value</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody id="metric-group-tbody-${group.id}">
                ${this.renderMetricGroupRows(group)}
              </tbody>
            </table>
          </div>
        </details>
      </article>`;
  },

  renderExpandedMetricContent(sl) {
    if (this.expandedMetricGroupId) return this.renderExpandedMetricGroupPanel(sl);
    return this.renderExpandedMetricPanel(sl);
  },

  renderExpandedMetricPanel(sl) {
    if (!this.expandedMetricId) return '';
    const metric = sl.trackedMetrics.find(m => m.id === this.expandedMetricId);
    if (!metric) {
      this.expandedMetricId = null;
      return '';
    }

    const rawEntries = this.getMetricEntries(metric.id);
    const entries = this.getMetricDisplayEntries(metric, rawEntries);
    const status = this.metricStatus(metric, entries);
    const trend = this.metricTrend(metric, entries);
    const rawEntryManagement = this.metricUsesReportAggregation(metric) ? `
        <div class="metric-expanded-log">
          <div class="metric-expanded-log-title">Raw Entry Management</div>
          <div class="metric-log-table-wrap expanded">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Value</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                ${this.renderMetricRows(metric, rawEntries, { canDelete: true, rawEntries: true })}
              </tbody>
            </table>
          </div>
        </div>` : '';

    return `
      <section class="metric-expanded-panel" id="metric-expanded-panel" tabindex="-1" aria-label="${this.escapeHtml(metric.name)} expanded metric view">
        <div class="metric-expanded-header">
          <div>
            <div class="metric-expanded-eyebrow">Expanded Trend</div>
            <h3>${this.escapeHtml(metric.name)}</h3>
            <p>${this.escapeHtml(this.metricTargetText(metric))}</p>
          </div>
          <button class="metric-expand-btn" type="button" onclick="App.toggleMetricExpand('${metric.id}')">Collapse</button>
        </div>

        <div class="metric-expanded-grid">
          <div class="metric-expanded-chart">
            ${this.renderMetricChart(metric, entries, { variant: 'expanded' })}
          </div>
          <aside class="metric-expanded-summary">
            <div>
              <span class="metric-label">Latest</span>
              <strong>${this.escapeHtml(this.metricLatestText(metric, entries))}</strong>
            </div>
            ${this.renderMetricBadge(status.label, status.tone)}
            ${this.renderMetricBadge(trend.label, trend.tone)}
            <span class="metric-expanded-count">${this.escapeHtml(this.metricExpandedCountText(metric, entries))}</span>
          </aside>
        </div>

        <div class="metric-expanded-log">
          <div class="metric-expanded-log-title">${this.metricUsesReportAggregation(metric) ? 'Monthly Totals' : this.metricIsMonthlySingle(metric) ? 'Monthly Values' : 'Entry History'}</div>
          <div class="metric-log-table-wrap expanded">
            <table>
              <thead>
                <tr>
                  <th>${this.escapeHtml(this.metricDateColumnLabel(metric))}</th>
                  <th>Value</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                ${this.renderMetricRows(metric, entries)}
              </tbody>
            </table>
          </div>
        </div>
        ${rawEntryManagement}
      </section>`;
  },

  renderExpandedMetricGroupPanel(sl) {
    if (!this.expandedMetricGroupId) return '';
    const group = sl.metricGroups?.find(g => g.id === this.expandedMetricGroupId);
    if (!group) {
      this.expandedMetricGroupId = null;
      return '';
    }

    const count = this.metricGroupEntryCount(group);
    const latestDate = this.metricGroupLatestDate(group);

    return `
      <section class="metric-expanded-panel" id="metric-expanded-panel" tabindex="-1" aria-label="${this.escapeHtml(group.name)} expanded metric view">
        <div class="metric-expanded-header">
          <div>
            <div class="metric-expanded-eyebrow">Expanded Combined Trend</div>
            <h3>${this.escapeHtml(group.name)}</h3>
            <p>${this.escapeHtml(group.description || `Track ${this.metricPeriodLabel(group).toLowerCase()} count`)}</p>
          </div>
          <button class="metric-expand-btn" type="button" onclick="App.toggleMetricGroupExpand('${group.id}')">Collapse</button>
        </div>

        <div class="metric-expanded-grid">
          <div class="metric-expanded-chart">
            ${this.renderMetricGroupChart(group, { variant: 'expanded' })}
          </div>
          <aside class="metric-expanded-summary">
            <div>
              <span class="metric-label">Latest ${this.escapeHtml(this.metricPeriodLabel(group))}</span>
              <strong>${this.escapeHtml(latestDate || 'No entries yet')}</strong>
            </div>
            <span class="metric-badge neutral">${count} ${count === 1 ? 'value' : 'values'} saved</span>
            ${this.renderMetricGroupLegend(group)}
          </aside>
        </div>

        <div class="metric-expanded-log">
          <div class="metric-expanded-log-title">Entry History</div>
          <div class="metric-log-table-wrap expanded">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Series</th>
                  <th>Value</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                ${this.renderMetricGroupRows(group)}
              </tbody>
            </table>
          </div>
        </div>
      </section>`;
  },

  });
}());
