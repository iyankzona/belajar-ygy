"use strict";
const required = { weekly: ['Week', 'Campaign', 'Cost', 'Total conv. value', 'ROAS'], monthly: ['Month', 'Campaign', 'Cost', 'Total conv. value', 'ROAS'] };
const colors = { Scale: '#16a34a', Maintain: '#2563eb', Reduce: '#dc2626', Monitor: '#f59e0b' };
const state = { view: 'weekly', weekly: [], monthly: [], errors: { weekly: '', monthly: '' }, target: 5, minSpend: 0, realloc: 15 };
const $ = (selector) => document.querySelector(selector);
const money = (value) => value === null || value === undefined || !Number.isFinite(value) ? 'N/A' : new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value);
const num = (value) => value === null || value === undefined || !Number.isFinite(value) ? 'N/A' : value.toLocaleString('id-ID', { maximumFractionDigits: 0 });
const roas = (value) => value === null || value === undefined || !Number.isFinite(value) ? 'N/A' : value.toFixed(2);
const parseNumber = (value) => Number(String(value ?? '').replace(/[^0-9.-]/g, '')) || 0;
function parseCsv(text) { const rows = []; let row = [], cell = '', quoted = false; for (let i = 0; i < text.length; i++) {
    const ch = text[i], next = text[i + 1];
    if (ch === '"' && quoted && next === '"') {
        cell += '"';
        i++;
    }
    else if (ch === '"')
        quoted = !quoted;
    else if (ch === ',' && !quoted) {
        row.push(cell.trim());
        cell = '';
    }
    else if ((ch === '\n' || ch === '\r') && !quoted) {
        if (ch === '\r' && next === '\n')
            i++;
        row.push(cell.trim());
        if (row.some(Boolean))
            rows.push(row);
        row = [];
        cell = '';
    }
    else
        cell += ch;
} row.push(cell.trim()); if (row.some(Boolean))
    rows.push(row); if (quoted)
    throw new Error('File cannot be parsed because it contains an unclosed quote.'); return rows; }
function loadRows(text, mode) { const parsed = parseCsv(text); if (parsed.length < 2)
    throw new Error('CSV file is empty or has no data rows.'); const headers = parsed[0].map(h => h.trim()); const missing = required[mode].filter(col => !headers.includes(col)); if (missing.length)
    throw new Error(`Missing required column(s): ${missing.join(', ')}`); const idx = Object.fromEntries(headers.map((h, i) => [h, i])); const periodKey = mode === 'weekly' ? 'Week' : 'Month'; return parsed.slice(1).filter(r => r.some(Boolean)).map(r => ({ period: r[idx[periodKey]] || '', campaign: r[idx.Campaign] || 'Unspecified Campaign', cost: parseNumber(r[idx.Cost]), revenue: parseNumber(r[idx['Total conv. value']]) })).filter(r => r.period && r.campaign); }
function periodTime(period, mode) { if (mode === 'monthly')
    return Date.parse(period.length === 7 ? `${period}-01` : period) || 0; return Date.parse(period.replace(/ - .*/, '')) || Date.parse(period) || 0; }
function analyze(rows, mode) { const grouped = new Map(); rows.forEach(r => grouped.set(r.campaign, [...(grouped.get(r.campaign) || []), r])); const output = []; grouped.forEach(campaignRows => { campaignRows.sort((a, b) => periodTime(a.period, mode) - periodTime(b.period, mode)); campaignRows.forEach((row, index) => { const prev = campaignRows[index - 1]; const currentRoas = row.cost === 0 ? null : row.revenue / row.cost; let category = 'Monitor'; let reason = 'First period or missing previous data.'; const incSpend = prev ? row.cost - prev.cost : null; const incRevenue = prev ? row.revenue - prev.revenue : null; const incRoas = incSpend && incSpend > 0 ? (incRevenue ?? 0) / incSpend : null; if (prev) {
    if ((incSpend ?? 0) <= 0) {
        category = 'Monitor';
        reason = incSpend === 0 ? 'No additional spend.' : 'Spend Reduced';
    }
    else if (row.cost < state.minSpend) {
        category = 'Monitor';
        reason = 'Below minimum spend threshold.';
    }
    else if ((incRevenue ?? 0) <= 0) {
        category = 'Reduce';
        reason = 'Underperforming: revenue was flat or negative despite higher spend.';
    }
    else if ((incRoas ?? 0) >= state.target * 1.05) {
        category = 'Scale';
        reason = 'Incremental ROAS is above target.';
    }
    else if ((incRoas ?? 0) >= state.target * 0.85 || Math.abs((currentRoas ?? 0) - (prev.cost ? prev.revenue / prev.cost : 0)) <= state.target * 0.1) {
        category = 'Maintain';
        reason = 'Close to target or current ROAS is stable.';
    }
    else {
        category = 'Reduce';
        reason = 'Incremental ROAS is below target.';
    }
} const factor = category === 'Scale' ? 1 + state.realloc / 100 : category === 'Reduce' ? 1 - state.realloc / 100 : 1; const recommendedSpend = row.cost * factor; output.push({ period: row.period, campaign: row.campaign, currentSpend: row.cost, previousSpend: prev?.cost ?? null, incrementalSpend: incSpend, currentRevenue: row.revenue, previousRevenue: prev?.revenue ?? null, incrementalRevenue: incRevenue, currentRoas, previousRoas: prev ? (prev.cost === 0 ? null : prev.revenue / prev.cost) : null, incrementalRoas: incRoas, category, recommendedSpend, reason, recommendation: category === 'Scale' ? `Increase budget by ${state.realloc}% to ${money(recommendedSpend)}` : category === 'Reduce' ? `Decrease budget by ${state.realloc}% to ${money(recommendedSpend)}` : category === 'Maintain' ? 'Keep budget unchanged' : 'Wait for more data' }); }); }); return output.sort((a, b) => periodTime(a.period, mode) - periodTime(b.period, mode) || a.campaign.localeCompare(b.campaign)); }
function bars(data, titleA, titleB) { const max = Math.max(1, ...data.flatMap(d => [Math.abs(d.a), Math.abs(d.b ?? 0)])); return `<div class="bar-legend"><span>${titleA}</span>${titleB ? `<span>${titleB}</span>` : ''}</div>${data.map(d => `<div class="bar-row"><small>${d.label}</small><div class="bar-track"><i style="width:${Math.abs(d.a) / max * 100}%;background:#2563eb"></i>${d.b !== undefined ? `<i style="width:${Math.abs(d.b) / max * 100}%;background:#16a34a"></i>` : ''}</div></div>`).join('')}`; }
function pie(counts) { const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1; return Object.keys(colors).map(c => `<div class="pie-row"><span style="background:${colors[c]};width:${counts[c] / total * 100}%"></span><b>${c}</b><em>${counts[c]}</em></div>`).join(''); }
function render() { const rows = state.view === 'weekly' ? state.weekly : state.monthly; const analyzed = analyze(rows, state.view); const spend = analyzed.reduce((s, r) => s + r.currentSpend, 0), revenue = analyzed.reduce((s, r) => s + r.currentRevenue, 0); const incSpend = analyzed.filter(r => (r.incrementalSpend ?? 0) > 0).reduce((s, r) => s + (r.incrementalSpend ?? 0), 0); const incRevenue = analyzed.filter(r => (r.incrementalSpend ?? 0) > 0).reduce((s, r) => s + (r.incrementalRevenue ?? 0), 0); const counts = { Scale: 0, Maintain: 0, Reduce: 0, Monitor: 0 }; analyzed.forEach(r => counts[r.category]++); const trend = Object.values(analyzed.reduce((acc, r) => { var _a; acc[_a = r.period] || (acc[_a] = { label: r.period, a: 0, b: 0 }); acc[r.period].a += r.currentSpend; acc[r.period].b += r.currentRevenue; return acc; }, {})); const changes = analyzed.filter(r => r.previousSpend !== null).map(r => ({ label: r.campaign, a: r.recommendedSpend - r.currentSpend })); const budgetReduce = analyzed.filter(r => r.category === 'Reduce').reduce((s, r) => s + (r.currentSpend - r.recommendedSpend), 0); $('#app').innerHTML = `<section class="hero"><div><p class="eyebrow">Google Ads Performance</p><h1>Campaign Incremental ROAS Analyzer</h1><p>Upload weekly and monthly campaign CSVs to identify efficient incremental revenue, budget reductions, and reallocation opportunities. Files are processed locally in your browser.</p></div><div class="hero-icon">↗</div></section><section class="panel controls"><label>Weekly CSV<input id="weekly-file" type="file" accept=".csv,text/csv"></label><label>Monthly CSV<input id="monthly-file" type="file" accept=".csv,text/csv"></label><label>Target Incremental ROAS<input id="target" type="number" step="0.1" value="${state.target}"></label><label>Minimum Spend Threshold<input id="minSpend" type="number" value="${state.minSpend}"></label><label>Reallocation %<select id="realloc"><option ${state.realloc === 10 ? 'selected' : ''}>10</option><option ${state.realloc === 15 ? 'selected' : ''}>15</option><option ${state.realloc === 20 ? 'selected' : ''}>20</option></select></label></section>${(state.errors.weekly || state.errors.monthly) ? `<div class="error">⚠ ${[state.errors.weekly, state.errors.monthly].filter(Boolean).join(' ')}</div>` : ''}<div class="tabs"><button class="${state.view === 'weekly' ? 'active' : ''}" data-view="weekly">Weekly Analysis</button><button class="${state.view === 'monthly' ? 'active' : ''}" data-view="monthly">Monthly Analysis</button></div><section class="cards">${[['Total Spend', money(spend)], ['Total Revenue', money(revenue)], ['Average ROAS', roas(spend ? revenue / spend : null)], ['Total Incremental Spend', money(incSpend)], ['Total Incremental Revenue', money(incRevenue)], ['Overall Incremental ROAS', roas(incSpend ? incRevenue / incSpend : null)]].map(([k, v]) => `<div class="card"><span>${k}</span><strong>${v}</strong></div>`).join('')}</section><section class="cards category-cards">${Object.keys(colors).map(c => `<div class="card"><span>${c}</span><strong style="color:${colors[c]}">${counts[c]}</strong></div>`).join('')}</section><section class="panel"><h2>Budget Allocation Summary</h2><p><b>Total budget to reduce / available for reallocation:</b> ${money(budgetReduce)}</p><p><b>Suggested campaigns to receive additional budget:</b> ${analyzed.filter(r => r.category === 'Scale').map(r => r.campaign).join(', ') || 'None yet'}</p><div class="suggestions">${analyzed.filter(r => r.category === 'Scale').map(r => `<span>${r.campaign}: ${money(r.recommendedSpend)}</span>`).join('')}</div></section><section class="charts"><div class="panel chart"><h2>Spend vs Revenue Trend</h2>${bars(trend, 'Spend', 'Revenue')}</div><div class="panel chart"><h2>ROAS vs Incremental ROAS by Campaign</h2>${bars(analyzed.filter(r => r.previousSpend !== null).map(r => ({ label: r.campaign, a: r.currentRoas ?? 0, b: r.incrementalRoas ?? 0 })), 'ROAS', 'Incremental ROAS')}</div><div class="panel chart"><h2>Campaign Category Distribution</h2>${pie(counts)}</div><div class="panel chart"><h2>Recommended Budget Changes</h2>${bars(changes, 'Change')}</div></section><section class="panel table-wrap"><h2>${state.view === 'weekly' ? 'Weekly' : 'Monthly'} Analysis Table</h2><table><thead><tr>${['Period', 'Campaign', 'Current Spend', 'Previous Spend', 'Incremental Spend', 'Current Revenue', 'Previous Revenue', 'Incremental Revenue', 'Current ROAS', 'Previous ROAS', 'Incremental ROAS', 'Performance Category', 'Budget Recommendation'].map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${analyzed.map(r => `<tr><td>${r.period}</td><td>${r.campaign}</td><td>${money(r.currentSpend)}</td><td>${money(r.previousSpend)}</td><td class="${(r.incrementalSpend ?? 0) < 0 ? 'neg' : ''}">${money(r.incrementalSpend)}</td><td>${money(r.currentRevenue)}</td><td>${money(r.previousRevenue)}</td><td class="${(r.incrementalRevenue ?? 0) < 0 ? 'neg' : ''}">${money(r.incrementalRevenue)}</td><td>${roas(r.currentRoas)}</td><td>${roas(r.previousRoas)}</td><td>${roas(r.incrementalRoas)}</td><td><span class="badge" title="${r.reason}" style="background:${colors[r.category]}">${r.category}</span></td><td>${r.recommendation}</td></tr>`).join('')}</tbody></table>${!analyzed.length ? `<p class="empty">Upload a ${state.view} CSV to begin.</p>` : ''}</section>`; bind(); }
function bind() { $('#weekly-file').addEventListener('change', upload('weekly')); $('#monthly-file').addEventListener('change', upload('monthly')); $('#target').addEventListener('input', e => { state.target = Number(e.target.value); render(); }); $('#minSpend').addEventListener('input', e => { state.minSpend = Number(e.target.value); render(); }); $('#realloc').addEventListener('change', e => { state.realloc = Number(e.target.value); render(); }); document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => { state.view = b.dataset.view; render(); })); }
function upload(mode) { return async (event) => { const file = event.target.files?.[0]; if (!file)
    return; try {
    const parsed = loadRows(await file.text(), mode);
    mode === 'weekly' ? state.weekly = parsed : state.monthly = parsed;
    state.errors[mode] = '';
}
catch (e) {
    state.errors[mode] = e instanceof Error ? e.message : 'File cannot be parsed.';
} render(); }; }
render();
