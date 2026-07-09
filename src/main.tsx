import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import './styles.css';

type ViewMode = 'weekly' | 'monthly';
type Category = 'Scale' | 'Maintain' | 'Reduce' | 'Monitor';

type RawRow = {
  period: string;
  campaign: string;
  cost: number;
  revenue: number;
};

type AnalyzedRow = {
  period: string;
  campaign: string;
  currentSpend: number;
  previousSpend: number | null;
  incrementalSpend: number | null;
  currentRevenue: number;
  previousRevenue: number | null;
  incrementalRevenue: number | null;
  currentRoas: number | null;
  previousRoas: number | null;
  incrementalRoas: number | null;
  category: Category;
  reason: string;
  recommendation: string;
  recommendedSpend: number;
};

const REQUIRED_COLUMNS: Record<ViewMode, string[]> = {
  weekly: ['Week', 'Campaign', 'Cost', 'Total conv. value', 'ROAS'],
  monthly: ['Month', 'Campaign', 'Cost', 'Total conv. value', 'ROAS'],
};

const CATEGORY_COLORS: Record<Category, string> = {
  Scale: '#16a34a',
  Maintain: '#2563eb',
  Reduce: '#dc2626',
  Monitor: '#f59e0b',
};

const formatCurrency = (value: number | null | undefined) =>
  value === null || value === undefined || !Number.isFinite(value)
    ? 'N/A'
    : new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0,
      }).format(value);

const formatRoas = (value: number | null | undefined) =>
  value === null || value === undefined || !Number.isFinite(value) ? 'N/A' : value.toFixed(2);

const parseNumber = (value: string | undefined) => Number(String(value ?? '').replace(/[^0-9.-]/g, '')) || 0;

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(cell.trim());
      cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  if (quoted) throw new Error('File cannot be parsed because it contains an unclosed quote.');
  return rows;
}

function loadRows(text: string, mode: ViewMode): RawRow[] {
  const parsed = parseCsv(text);
  if (parsed.length < 2) throw new Error('CSV file is empty or has no data rows.');

  const headers = parsed[0].map((header) => header.trim());
  const missing = REQUIRED_COLUMNS[mode].filter((column) => !headers.includes(column));
  if (missing.length) throw new Error(`Missing required column(s): ${missing.join(', ')}`);

  const indexes = Object.fromEntries(headers.map((header, index) => [header, index]));
  const periodColumn = mode === 'weekly' ? 'Week' : 'Month';

  return parsed
    .slice(1)
    .filter((row) => row.some(Boolean))
    .map((row) => ({
      period: row[indexes[periodColumn]] || '',
      campaign: row[indexes.Campaign] || 'Unspecified Campaign',
      cost: parseNumber(row[indexes.Cost]),
      revenue: parseNumber(row[indexes['Total conv. value']]),
    }))
    .filter((row) => row.period && row.campaign);
}

function periodTime(period: string, mode: ViewMode): number {
  if (mode === 'monthly') return Date.parse(period.length === 7 ? `${period}-01` : period) || 0;
  return Date.parse(period.replace(/ - .*/, '')) || Date.parse(period) || 0;
}

function analyzeRows(
  rows: RawRow[],
  mode: ViewMode,
  targetIncrementalRoas: number,
  minimumSpend: number,
  reallocationPercentage: number,
): AnalyzedRow[] {
  const grouped = new Map<string, RawRow[]>();
  rows.forEach((row) => grouped.set(row.campaign, [...(grouped.get(row.campaign) || []), row]));

  const output: AnalyzedRow[] = [];

  grouped.forEach((campaignRows) => {
    campaignRows.sort((a, b) => periodTime(a.period, mode) - periodTime(b.period, mode));

    campaignRows.forEach((row, index) => {
      const previous = campaignRows[index - 1];
      const currentRoas = row.cost === 0 ? null : row.revenue / row.cost;
      const previousRoas = previous ? (previous.cost === 0 ? null : previous.revenue / previous.cost) : null;
      const incrementalSpend = previous ? row.cost - previous.cost : null;
      const incrementalRevenue = previous ? row.revenue - previous.revenue : null;
      const incrementalRoas = incrementalSpend && incrementalSpend > 0 ? (incrementalRevenue ?? 0) / incrementalSpend : null;
      let category: Category = 'Monitor';
      let reason = 'First period or missing previous period data.';

      if (previous) {
        if ((incrementalSpend ?? 0) <= 0) {
          category = 'Monitor';
          reason = incrementalSpend === 0 ? 'No additional spend.' : 'Spend Reduced';
        } else if (row.cost < minimumSpend) {
          category = 'Monitor';
          reason = 'Below minimum spend threshold.';
        } else if ((incrementalRevenue ?? 0) <= 0) {
          category = 'Reduce';
          reason = 'Underperforming: revenue was flat or negative despite higher spend.';
        } else if ((incrementalRoas ?? 0) >= targetIncrementalRoas * 1.05) {
          category = 'Scale';
          reason = 'Incremental ROAS is above target.';
        } else if (
          (incrementalRoas ?? 0) >= targetIncrementalRoas * 0.85 ||
          Math.abs((currentRoas ?? 0) - (previousRoas ?? 0)) <= targetIncrementalRoas * 0.1
        ) {
          category = 'Maintain';
          reason = 'Incremental ROAS is close to target or current ROAS is stable.';
        } else {
          category = 'Reduce';
          reason = 'Incremental ROAS is below target.';
        }
      }

      const multiplier = category === 'Scale' ? 1 + reallocationPercentage / 100 : category === 'Reduce' ? 1 - reallocationPercentage / 100 : 1;
      const recommendedSpend = row.cost * multiplier;

      output.push({
        period: row.period,
        campaign: row.campaign,
        currentSpend: row.cost,
        previousSpend: previous?.cost ?? null,
        incrementalSpend,
        currentRevenue: row.revenue,
        previousRevenue: previous?.revenue ?? null,
        incrementalRevenue,
        currentRoas,
        previousRoas,
        incrementalRoas,
        category,
        reason,
        recommendedSpend,
        recommendation:
          category === 'Scale'
            ? `Increase budget by ${reallocationPercentage}% to ${formatCurrency(recommendedSpend)}`
            : category === 'Reduce'
              ? `Decrease budget by ${reallocationPercentage}% to ${formatCurrency(recommendedSpend)}`
              : category === 'Maintain'
                ? 'Keep budget unchanged'
                : 'Wait for more data',
      });
    });
  });

  return output.sort((a, b) => periodTime(a.period, mode) - periodTime(b.period, mode) || a.campaign.localeCompare(b.campaign));
}

function App() {
  const [view, setView] = useState<ViewMode>('weekly');
  const [weeklyRows, setWeeklyRows] = useState<RawRow[]>([]);
  const [monthlyRows, setMonthlyRows] = useState<RawRow[]>([]);
  const [errors, setErrors] = useState<Record<ViewMode, string>>({ weekly: '', monthly: '' });
  const [targetIncrementalRoas, setTargetIncrementalRoas] = useState(5);
  const [minimumSpend, setMinimumSpend] = useState(0);
  const [reallocationPercentage, setReallocationPercentage] = useState(15);

  const sourceRows = view === 'weekly' ? weeklyRows : monthlyRows;
  const analyzedRows = useMemo(
    () => analyzeRows(sourceRows, view, targetIncrementalRoas, minimumSpend, reallocationPercentage),
    [sourceRows, view, targetIncrementalRoas, minimumSpend, reallocationPercentage],
  );

  const metrics = useMemo(() => {
    const totalSpend = analyzedRows.reduce((sum, row) => sum + row.currentSpend, 0);
    const totalRevenue = analyzedRows.reduce((sum, row) => sum + row.currentRevenue, 0);
    const incrementalRows = analyzedRows.filter((row) => (row.incrementalSpend ?? 0) > 0);
    const totalIncrementalSpend = incrementalRows.reduce((sum, row) => sum + (row.incrementalSpend ?? 0), 0);
    const totalIncrementalRevenue = incrementalRows.reduce((sum, row) => sum + (row.incrementalRevenue ?? 0), 0);
    const counts = { Scale: 0, Maintain: 0, Reduce: 0, Monitor: 0 } as Record<Category, number>;
    analyzedRows.forEach((row) => { counts[row.category] += 1; });
    return { totalSpend, totalRevenue, averageRoas: totalSpend ? totalRevenue / totalSpend : null, totalIncrementalSpend, totalIncrementalRevenue, overallIncrementalRoas: totalIncrementalSpend ? totalIncrementalRevenue / totalIncrementalSpend : null, counts };
  }, [analyzedRows]);

  const trendData = Object.values(
    analyzedRows.reduce<Record<string, { period: string; spend: number; revenue: number }>>((accumulator, row) => {
      accumulator[row.period] ||= { period: row.period, spend: 0, revenue: 0 };
      accumulator[row.period].spend += row.currentSpend;
      accumulator[row.period].revenue += row.currentRevenue;
      return accumulator;
    }, {}),
  );

  const roasData = analyzedRows
    .filter((row) => row.previousSpend !== null)
    .map((row) => ({ campaign: row.campaign, currentRoas: row.currentRoas ?? 0, incrementalRoas: row.incrementalRoas ?? 0 }));

  const budgetChangeData = analyzedRows.map((row) => ({ campaign: row.campaign, change: row.recommendedSpend - row.currentSpend }));
  const categoryData = (Object.keys(metrics.counts) as Category[]).map((category) => ({ category, count: metrics.counts[category] }));
  const budgetAvailable = analyzedRows.filter((row) => row.category === 'Reduce').reduce((sum, row) => sum + (row.currentSpend - row.recommendedSpend), 0);
  const scaleRows = analyzedRows.filter((row) => row.category === 'Scale');

  const upload = (mode: ViewMode) => async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const rows = loadRows(await file.text(), mode);
      if (mode === 'weekly') setWeeklyRows(rows);
      else setMonthlyRows(rows);
      setErrors((current) => ({ ...current, [mode]: '' }));
    } catch (error) {
      setErrors((current) => ({ ...current, [mode]: error instanceof Error ? error.message : 'File cannot be parsed.' }));
    }
  };

  return (
    <main>
      <section className="hero">
        <div>
          <p className="eyebrow">Google Ads Performance</p>
          <h1>Campaign Incremental ROAS Analyzer</h1>
          <p>Upload weekly and monthly campaign CSVs to compare each campaign against its previous period and uncover efficient incremental revenue.</p>
        </div>
        <div className="heroBadge">iROAS</div>
      </section>

      <section className="panel controls">
        <label>Weekly CSV<input type="file" accept=".csv,text/csv" onChange={upload('weekly')} /></label>
        <label>Monthly CSV<input type="file" accept=".csv,text/csv" onChange={upload('monthly')} /></label>
        <label>Target Incremental ROAS<input type="number" step="0.1" value={targetIncrementalRoas} onChange={(event) => setTargetIncrementalRoas(Number(event.target.value))} /></label>
        <label>Minimum Spend Threshold<input type="number" value={minimumSpend} onChange={(event) => setMinimumSpend(Number(event.target.value))} /></label>
        <label>Budget Reallocation<select value={reallocationPercentage} onChange={(event) => setReallocationPercentage(Number(event.target.value))}><option value="10">10%</option><option value="15">15%</option><option value="20">20%</option></select></label>
      </section>

      {(errors.weekly || errors.monthly) && <div className="error">{[errors.weekly, errors.monthly].filter(Boolean).join(' ')}</div>}

      <div className="tabs">
        <button className={view === 'weekly' ? 'active' : ''} onClick={() => setView('weekly')}>Weekly Analysis</button>
        <button className={view === 'monthly' ? 'active' : ''} onClick={() => setView('monthly')}>Monthly Analysis</button>
      </div>

      <section className="cards">
        <Metric label="Total Spend" value={formatCurrency(metrics.totalSpend)} />
        <Metric label="Total Revenue" value={formatCurrency(metrics.totalRevenue)} />
        <Metric label="Average ROAS" value={formatRoas(metrics.averageRoas)} />
        <Metric label="Total Incremental Spend" value={formatCurrency(metrics.totalIncrementalSpend)} />
        <Metric label="Total Incremental Revenue" value={formatCurrency(metrics.totalIncrementalRevenue)} />
        <Metric label="Overall Incremental ROAS" value={formatRoas(metrics.overallIncrementalRoas)} />
      </section>

      <section className="cards compact">
        {(Object.keys(CATEGORY_COLORS) as Category[]).map((category) => <Metric key={category} label={category} value={String(metrics.counts[category])} color={CATEGORY_COLORS[category]} />)}
      </section>

      <section className="panel">
        <h2>Budget Allocation Summary</h2>
        <p><b>Total budget to reduce from underperforming campaigns:</b> {formatCurrency(budgetAvailable)}</p>
        <p><b>Total budget available for reallocation:</b> {formatCurrency(budgetAvailable)}</p>
        <p><b>Suggested campaigns to receive additional budget:</b> {scaleRows.map((row) => row.campaign).join(', ') || 'None yet'}</p>
        <div className="suggestions">{scaleRows.map((row) => <span key={`${row.period}-${row.campaign}`}>{row.campaign}: {formatCurrency(row.recommendedSpend)}</span>)}</div>
      </section>

      <section className="charts">
        <Chart title="Spend vs Revenue Trend by Period"><LineChart data={trendData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="period" /><YAxis tickFormatter={(value) => formatCurrency(Number(value)).replace('Rp', '')} /><Tooltip formatter={(value) => formatCurrency(Number(value))} /><Legend /><Line dataKey="spend" stroke="#2563eb" strokeWidth={3} /><Line dataKey="revenue" stroke="#16a34a" strokeWidth={3} /></LineChart></Chart>
        <Chart title="ROAS vs Incremental ROAS by Campaign"><BarChart data={roasData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="campaign" /><YAxis /><Tooltip /><Legend /><Bar dataKey="currentRoas" fill="#2563eb" /><Bar dataKey="incrementalRoas" fill="#f59e0b" /></BarChart></Chart>
        <Chart title="Campaign Category Distribution"><PieChart><Tooltip /><Pie data={categoryData} dataKey="count" nameKey="category" outerRadius={110} label>{categoryData.map((entry) => <Cell key={entry.category} fill={CATEGORY_COLORS[entry.category]} />)}</Pie><Legend /></PieChart></Chart>
        <Chart title="Recommended Budget Changes by Campaign"><BarChart data={budgetChangeData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="campaign" /><YAxis tickFormatter={(value) => formatCurrency(Number(value)).replace('Rp', '')} /><Tooltip formatter={(value) => formatCurrency(Number(value))} /><Bar dataKey="change" fill="#7c3aed" /></BarChart></Chart>
      </section>

      <section className="panel tableWrap">
        <h2>{view === 'weekly' ? 'Weekly' : 'Monthly'} Analysis Table</h2>
        <table>
          <thead><tr>{['Period','Campaign','Current Spend','Previous Spend','Incremental Spend','Current Revenue','Previous Revenue','Incremental Revenue','Current ROAS','Previous ROAS','Incremental ROAS','Performance Category','Budget Recommendation'].map((heading) => <th key={heading}>{heading}</th>)}</tr></thead>
          <tbody>{analyzedRows.map((row) => <tr key={`${row.period}-${row.campaign}`}><td>{row.period}</td><td>{row.campaign}</td><td>{formatCurrency(row.currentSpend)}</td><td>{formatCurrency(row.previousSpend)}</td><td className={(row.incrementalSpend ?? 0) < 0 ? 'negative' : ''}>{formatCurrency(row.incrementalSpend)}</td><td>{formatCurrency(row.currentRevenue)}</td><td>{formatCurrency(row.previousRevenue)}</td><td className={(row.incrementalRevenue ?? 0) < 0 ? 'negative' : ''}>{formatCurrency(row.incrementalRevenue)}</td><td>{formatRoas(row.currentRoas)}</td><td>{formatRoas(row.previousRoas)}</td><td>{formatRoas(row.incrementalRoas)}</td><td><span className="badge" title={row.reason} style={{ background: CATEGORY_COLORS[row.category] }}>{row.category}</span></td><td>{row.recommendation}</td></tr>)}</tbody>
        </table>
        {!analyzedRows.length && <p className="empty">Upload a {view} CSV to begin.</p>}
      </section>
    </main>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color?: string }) {
  return <div className="card"><span>{label}</span><strong style={{ color }}>{value}</strong></div>;
}

function Chart({ title, children }: { title: string; children: React.ReactElement }) {
  return <div className="panel chart"><h2>{title}</h2><ResponsiveContainer width="100%" height={320}>{children}</ResponsiveContainer></div>;
}

createRoot(document.getElementById('root')!).render(<App />);
