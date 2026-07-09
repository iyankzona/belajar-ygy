'use client'

import { useMemo, useState } from 'react'
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
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import {
  analyzeRows,
  CATEGORY_COLORS,
  computeMetrics,
  formatCurrency,
  formatRoas,
  loadRows,
  type Category,
  type RawRow,
  type ViewMode,
} from '@/lib/roas'
import { AnalysisTable } from '@/components/AnalysisTable'
import { BudgetSummary } from '@/components/BudgetSummary'
import { ChartPanel } from '@/components/ChartPanel'
import { MetricCard } from '@/components/MetricCard'

export function Analyzer() {
  const [view, setView] = useState<ViewMode>('weekly')
  const [weeklyRows, setWeeklyRows] = useState<RawRow[]>([])
  const [monthlyRows, setMonthlyRows] = useState<RawRow[]>([])
  const [errors, setErrors] = useState<Record<ViewMode, string>>({
    weekly: '',
    monthly: '',
  })
  const [targetIncrementalRoas, setTargetIncrementalRoas] = useState(5)
  const [minimumSpend, setMinimumSpend] = useState(0)
  const [reallocationPercentage, setReallocationPercentage] = useState(15)

  const sourceRows = view === 'weekly' ? weeklyRows : monthlyRows

  const analyzedRows = useMemo(
    () =>
      analyzeRows(
        sourceRows,
        view,
        targetIncrementalRoas,
        minimumSpend,
        reallocationPercentage,
      ),
    [sourceRows, view, targetIncrementalRoas, minimumSpend, reallocationPercentage],
  )

  const metrics = useMemo(() => computeMetrics(analyzedRows), [analyzedRows])

  const trendData = Object.values(
    analyzedRows.reduce<Record<string, { period: string; spend: number; revenue: number }>>(
      (acc, row) => {
        acc[row.period] ??= { period: row.period, spend: 0, revenue: 0 }
        acc[row.period].spend += row.currentSpend
        acc[row.period].revenue += row.currentRevenue
        return acc
      },
      {},
    ),
  )

  const roasData = analyzedRows
    .filter((r) => r.previousSpend !== null)
    .map((r) => ({
      campaign: r.campaign,
      currentRoas: r.currentRoas ?? 0,
      incrementalRoas: r.incrementalRoas ?? 0,
    }))

  const budgetChangeData = analyzedRows.map((r) => ({
    campaign: r.campaign,
    change: r.recommendedSpend - r.currentSpend,
  }))

  const categoryData = (Object.keys(metrics.counts) as Category[]).map((cat) => ({
    category: cat,
    count: metrics.counts[cat],
  }))

  const upload =
    (mode: ViewMode) => async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      try {
        const rows = loadRows(await file.text(), mode)
        if (mode === 'weekly') setWeeklyRows(rows)
        else setMonthlyRows(rows)
        setErrors((cur) => ({ ...cur, [mode]: '' }))
      } catch (err) {
        setErrors((cur) => ({
          ...cur,
          [mode]: err instanceof Error ? err.message : 'File cannot be parsed.',
        }))
      }
    }

  const inputClass =
    'w-full px-3 py-3 border border-border rounded-2xl bg-subtle text-[#0f172a] text-sm focus:outline-none focus:ring-2 focus:ring-primary'
  const labelClass = 'flex flex-col gap-2 font-extrabold text-sm text-[#334155]'

  return (
    <main className="max-w-[1440px] mx-auto px-7 py-7">
      {/* Hero */}
      <section
        className="flex items-center justify-between gap-7 p-9 rounded-[30px] text-white mb-6"
        style={{
          background: 'linear-gradient(135deg, #0f172a, #1d4ed8)',
          boxShadow: '0 24px 60px rgba(30,41,59,0.24)',
        }}
      >
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-[#93c5fd] mb-2">
            Google Ads Performance
          </p>
          <h1 className="text-balance font-black leading-none text-4xl md:text-5xl lg:text-6xl mb-3">
            Campaign Incremental ROAS Analyzer
          </h1>
          <p className="text-[#dbeafe] max-w-2xl text-sm leading-relaxed">
            Upload weekly and monthly campaign CSVs to compare each campaign
            against its previous period and uncover efficient incremental revenue.
          </p>
        </div>
        <div
          className="hidden md:grid place-items-center flex-shrink-0 w-28 h-28 rounded-[28px] text-2xl font-black"
          style={{ background: 'rgba(255,255,255,0.14)' }}
        >
          iROAS
        </div>
      </section>

      {/* Controls */}
      <section className="bg-surface border border-border rounded-[22px] shadow-[0_16px_40px_rgba(100,116,139,0.12)] p-6 mb-5 grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-4">
        <label className={labelClass}>
          Weekly CSV
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={upload('weekly')}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Monthly CSV
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={upload('monthly')}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Target Incremental ROAS
          <input
            type="number"
            step="0.1"
            value={targetIncrementalRoas}
            onChange={(e) => setTargetIncrementalRoas(Number(e.target.value))}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Minimum Spend Threshold
          <input
            type="number"
            value={minimumSpend}
            onChange={(e) => setMinimumSpend(Number(e.target.value))}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Budget Reallocation
          <select
            value={reallocationPercentage}
            onChange={(e) => setReallocationPercentage(Number(e.target.value))}
            className={inputClass}
          >
            <option value="10">10%</option>
            <option value="15">15%</option>
            <option value="20">20%</option>
          </select>
        </label>
      </section>

      {/* Error */}
      {(errors.weekly || errors.monthly) && (
        <div className="px-4 py-4 rounded-[18px] bg-[#fee2e2] text-[#991b1b] font-extrabold text-sm mb-5">
          {[errors.weekly, errors.monthly].filter(Boolean).join(' ')}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-3 mb-5">
        {(['weekly', 'monthly'] as ViewMode[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setView(tab)}
            className={`rounded-full px-6 py-3 font-black text-sm cursor-pointer border-0 transition-colors ${
              view === tab
                ? 'bg-primary text-white'
                : 'bg-[#dbeafe] text-primary-dark hover:bg-primary hover:text-white'
            }`}
          >
            {tab === 'weekly' ? 'Weekly Analysis' : 'Monthly Analysis'}
          </button>
        ))}
      </div>

      {/* Main metrics */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4 mb-4">
        <MetricCard label="Total Spend" value={formatCurrency(metrics.totalSpend)} />
        <MetricCard label="Total Revenue" value={formatCurrency(metrics.totalRevenue)} />
        <MetricCard label="Average ROAS" value={formatRoas(metrics.averageRoas)} />
        <MetricCard
          label="Total Incremental Spend"
          value={formatCurrency(metrics.totalIncrementalSpend)}
        />
        <MetricCard
          label="Total Incremental Revenue"
          value={formatCurrency(metrics.totalIncrementalRevenue)}
        />
        <MetricCard
          label="Overall Incremental ROAS"
          value={formatRoas(metrics.overallIncrementalRoas)}
        />
      </div>

      {/* Category counts */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4 mb-5">
        {(Object.keys(CATEGORY_COLORS) as Category[]).map((cat) => (
          <MetricCard
            key={cat}
            label={cat}
            value={String(metrics.counts[cat])}
            color={CATEGORY_COLORS[cat]}
            accent={CATEGORY_COLORS[cat]}
          />
        ))}
      </div>

      {/* Budget summary */}
      <div className="mb-5">
        <BudgetSummary analyzedRows={analyzedRows} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(470px,1fr))] gap-5 mb-5">
        <ChartPanel title="Spend vs Revenue Trend by Period">
          <LineChart data={trendData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="period" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={(v) => formatCurrency(Number(v)).replace('Rp', '')} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v) => formatCurrency(Number(v))} />
            <Legend />
            <Line dataKey="spend" stroke="#2563eb" strokeWidth={3} dot={false} />
            <Line dataKey="revenue" stroke="#16a34a" strokeWidth={3} dot={false} />
          </LineChart>
        </ChartPanel>

        <ChartPanel title="ROAS vs Incremental ROAS by Campaign">
          <BarChart data={roasData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="campaign" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="currentRoas" fill="#2563eb" radius={[4, 4, 0, 0]} />
            <Bar dataKey="incrementalRoas" fill="#f59e0b" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartPanel>

        <ChartPanel title="Campaign Category Distribution">
          <PieChart>
            <Tooltip />
            <Pie
              data={categoryData}
              dataKey="count"
              nameKey="category"
              outerRadius={110}
              label
            >
              {categoryData.map((entry) => (
                <Cell
                  key={entry.category}
                  fill={CATEGORY_COLORS[entry.category as Category]}
                />
              ))}
            </Pie>
            <Legend />
          </PieChart>
        </ChartPanel>

        <ChartPanel title="Recommended Budget Changes by Campaign">
          <BarChart data={budgetChangeData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="campaign" tick={{ fontSize: 10 }} />
            <YAxis
              tickFormatter={(v) => formatCurrency(Number(v)).replace('Rp', '')}
              tick={{ fontSize: 11 }}
            />
            <Tooltip formatter={(v) => formatCurrency(Number(v))} />
            <Bar dataKey="change" fill="#7c3aed" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartPanel>
      </div>

      {/* Table */}
      <AnalysisTable rows={analyzedRows} view={view} />
    </main>
  )
}
