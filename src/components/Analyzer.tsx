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
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import {
  aggregateBiweekly,
  analyzeRows,
  CADENCE_DAYS,
  CATEGORY_COLORS,
  computeConsolidatedMetrics,
  computeMetrics,
  consolidateRows,
  formatCurrency,
  formatRoas,
  getAvailablePeriods,
  getDaysInPeriod,
  loadRows,
  periodTime,
  type Category,
  type DecisionCadence,
  type RawRow,
  type ViewMode,
} from '@/lib/roas'
import { loadActions, recordAction, type CampaignActionsStore } from '@/lib/campaignActions'
import { AnalysisTable } from '@/components/AnalysisTable'
import { BudgetSummary } from '@/components/BudgetSummary'
import { RecommendationPanel } from '@/components/RecommendationPanel'

// ─── Small reusable pieces ────────────────────────────────────────────────────

function SectionLabel({ step, title }: { step: number; title: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <span className="flex items-center justify-center w-7 h-7 rounded-full bg-primary text-white text-xs font-bold shrink-0">
        {step}
      </span>
      <h2 className="text-sm font-semibold text-text-light uppercase tracking-widest">{title}</h2>
    </div>
  )
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-surface border border-border rounded-xl shadow-sm ${className}`}>
      {children}
    </div>
  )
}

function InfoIcon() {
  return (
    <svg className="w-3.5 h-3.5 text-muted/60 shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
    </svg>
  )
}

function MetricTile({
  label,
  value,
  sub,
  accent,
  tooltip,
  alignRight = false,
}: {
  label: string
  value: string
  sub?: string
  accent?: string
  tooltip?: string
  alignRight?: boolean
}) {
  const [show, setShow] = useState(false)
  return (
    <div
      className={`relative flex flex-col gap-1.5 ${alignRight ? 'items-end text-right' : ''}`}
      onMouseEnter={() => tooltip && setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => tooltip && setShow(true)}
      onBlur={() => setShow(false)}
    >
      <div className={`flex items-center gap-1 ${alignRight ? 'flex-row-reverse' : ''}`}>
        <span className="text-xs font-medium text-muted uppercase tracking-wide leading-none">{label}</span>
        {tooltip && <InfoIcon />}
      </div>
      <strong
        className="text-xl font-bold leading-tight text-text tabular-nums"
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </strong>
      {sub && <span className="text-xs text-muted leading-none">{sub}</span>}
      {show && tooltip && (
        <div className={`absolute bottom-full ${alignRight ? 'right-0' : 'left-0'} mb-2 z-50 w-60 rounded-lg bg-[#1c1917] text-white text-xs leading-relaxed p-3 shadow-xl pointer-events-none`}>
          {tooltip}
          <div className={`absolute top-full ${alignRight ? 'right-4' : 'left-4'} w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-[#1c1917]`} />
        </div>
      )}
    </div>
  )
}

function Divider({ vertical = false }: { vertical?: boolean }) {
  return vertical
    ? <div className="w-px self-stretch bg-border mx-1" />
    : <div className="h-px w-full bg-border" />
}

function FileUploadCard({
  label,
  description,
  fileName,
  error,
  onChange,
}: {
  label: string
  description: string
  fileName: string | null
  error: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
}) {
  return (
    <label className="flex flex-col gap-2 cursor-pointer group">
      <div
        className={`relative flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-xl p-6 transition-colors
          ${error ? 'border-reduce bg-reduce-bg' : fileName ? 'border-primary bg-primary-light' : 'border-border bg-surface-2 hover:border-primary hover:bg-primary-light'}`}
      >
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={onChange}
          className="absolute inset-0 opacity-0 cursor-pointer"
        />
        <svg
          className={`w-8 h-8 ${error ? 'text-reduce' : fileName ? 'text-primary' : 'text-muted group-hover:text-primary'}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
          aria-hidden="true"
        >
          {fileName ? (
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          )}
        </svg>
        <div className="text-center">
          <p className={`text-sm font-semibold ${error ? 'text-reduce' : fileName ? 'text-primary' : 'text-text'}`}>
            {error ? 'Error — click to try again' : (fileName ?? label)}
          </p>
          <p className="text-xs text-muted mt-0.5">
            {error || (fileName ? 'Click to replace' : description)}
          </p>
        </div>
      </div>
    </label>
  )
}

function ChartCard({ title, children }: { title: string; children: React.ReactElement }) {
  return (
    <Card className="p-5">
      <p className="text-sm font-semibold text-text mb-4">{title}</p>
      <ResponsiveContainer width="100%" height={220}>
        {children}
      </ResponsiveContainer>
    </Card>
  )
}

// ─── Main Analyzer ─────────────────────────────────────────────────────────────

export function Analyzer() {
  const [view, setView] = useState<ViewMode>('weekly')
  const [weeklyRows, setWeeklyRows] = useState<RawRow[]>([])
  const [monthlyRows, setMonthlyRows] = useState<RawRow[]>([])
  const [weeklyFileName, setWeeklyFileName] = useState<string | null>(null)
  const [monthlyFileName, setMonthlyFileName] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<ViewMode, string>>({ weekly: '', biweekly: '', monthly: '' })
  const [targetIncrementalRoas, setTargetIncrementalRoas] = useState(5)
  const [minimumSpend, setMinimumSpend] = useState(0)
  const [reallocationPercentage, setReallocationPercentage] = useState(15)
  const [showHistorical, setShowHistorical] = useState(false)
  const [selectedWeeklyPeriod, setSelectedWeeklyPeriod] = useState<string | null>(null)
  const [selectedBiweeklyPeriod, setSelectedBiweeklyPeriod] = useState<string | null>(null)
  const [selectedMonthlyPeriod, setSelectedMonthlyPeriod] = useState<string | null>(null)
  const [decisionCadence, setDecisionCadence] = useState<DecisionCadence>('monthly')
  const [lastActionDates, setLastActionDates] = useState<CampaignActionsStore>(() => loadActions())

  // Biweekly rows are derived from weekly data — aggregated on the fly
  const biweeklyRows = useMemo(() => aggregateBiweekly(weeklyRows), [weeklyRows])

  const sourceRows = view === 'weekly' ? weeklyRows : view === 'biweekly' ? biweeklyRows : monthlyRows
  const hasData = sourceRows.length > 0
  const hasAnyData = weeklyRows.length > 0 || monthlyRows.length > 0

  const availablePeriods = useMemo(
    () => getAvailablePeriods(sourceRows, view),
    [sourceRows, view],
  )

  // Active selected period — fall back to latest if none selected
  const selectedPeriod = useMemo(() => {
    const chosen =
      view === 'weekly' ? selectedWeeklyPeriod
      : view === 'biweekly' ? selectedBiweeklyPeriod
      : selectedMonthlyPeriod
    if (chosen && availablePeriods.includes(chosen)) return chosen
    return availablePeriods[availablePeriods.length - 1] ?? null
  }, [view, selectedWeeklyPeriod, selectedBiweeklyPeriod, selectedMonthlyPeriod, availablePeriods])

  const setSelectedPeriod = (p: string) => {
    if (view === 'weekly') setSelectedWeeklyPeriod(p)
    else if (view === 'biweekly') setSelectedBiweeklyPeriod(p)
    else setSelectedMonthlyPeriod(p)
  }

  const analyzedRows = useMemo(
    () => analyzeRows(sourceRows, view, targetIncrementalRoas, minimumSpend, reallocationPercentage, selectedPeriod ?? undefined),
    [sourceRows, view, targetIncrementalRoas, minimumSpend, reallocationPercentage, selectedPeriod],
  )

  const consolidatedRows = useMemo(
    () => consolidateRows(sourceRows, view, targetIncrementalRoas, minimumSpend, reallocationPercentage, selectedPeriod ?? undefined, lastActionDates, CADENCE_DAYS[decisionCadence]),
    [sourceRows, view, targetIncrementalRoas, minimumSpend, reallocationPercentage, selectedPeriod, lastActionDates, decisionCadence],
  )

  const handleAction = (campaign: string) => {
    setLastActionDates((prev) => recordAction(prev, campaign))
  }

  const metrics = useMemo(() => computeConsolidatedMetrics(consolidatedRows), [consolidatedRows])

  // Avg daily spend: total spend of the selected period divided by days in that period
  const avgDailySpend = useMemo(() => {
    if (!selectedPeriod || metrics.totalSpend === 0) return null
    const days = getDaysInPeriod(selectedPeriod, view)
    return metrics.totalSpend / days
  }, [metrics.totalSpend, selectedPeriod, view])

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
      name: r.campaign,
      current: r.currentRoas ?? 0,
      incremental: r.incrementalRoas ?? 0,
    }))

  const budgetChangeData = analyzedRows.map((r) => ({
    name: r.campaign,
    change: r.recommendedSpend - r.currentSpend,
  }))

  const categoryData = (Object.keys(metrics.counts) as Category[]).map((cat) => ({
    name: cat,
    value: metrics.counts[cat],
  }))

  const upload = (mode: ViewMode) => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const rows = loadRows(await file.text(), mode)
      if (mode === 'weekly') { setWeeklyRows(rows); setWeeklyFileName(file.name) }
      else { setMonthlyRows(rows); setMonthlyFileName(file.name) }
      setErrors((cur) => ({ ...cur, [mode]: '' }))
    } catch (err) {
      if (mode === 'weekly') setWeeklyFileName(null)
      else setMonthlyFileName(null)
      setErrors((cur) => ({ ...cur, [mode]: err instanceof Error ? err.message : 'File cannot be parsed.' }))
    }
    e.target.value = ''
  }

  const inputClass =
    'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition'

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="bg-surface border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
          </div>
          <div>
            <h1 className="text-sm font-bold text-text leading-tight">Incremental ROAS Analyzer</h1>
            <p className="text-xs text-muted">Google Ads Campaign Performance</p>
          </div>
        </div>
        {hasAnyData && (
          <div className="flex items-center gap-2 text-xs text-muted">
            <span className="w-2 h-2 rounded-full bg-scale inline-block" />
            Data loaded
          </div>
        )}
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-8">

        {/* ── Step 1: Upload ──────────────────────────────────────────────── */}
        <section>
          <SectionLabel step={1} title="Upload your CSV files" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FileUploadCard
              label="Upload Weekly CSV"
              description="Columns: Week, Campaign, Cost, Total conv. value, ROAS"
              fileName={weeklyFileName}
              error={errors.weekly}
              onChange={upload('weekly')}
            />
            <FileUploadCard
              label="Upload Monthly CSV"
              description="Columns: Month, Campaign, Cost, Total conv. value, ROAS"
              fileName={monthlyFileName}
              error={errors.monthly}
              onChange={upload('monthly')}
            />
          </div>
        </section>

        {/* ── Step 2: Configure ───────────────────────────────────────────── */}
        <section>
          <SectionLabel step={2} title="Configure parameters" />
          <Card className="p-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-text-light uppercase tracking-wide">
                  Target Incremental ROAS
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={targetIncrementalRoas}
                  onChange={(e) => setTargetIncrementalRoas(Number(e.target.value))}
                  className={inputClass}
                />
                <p className="text-xs text-muted">Campaigns above this threshold are scaled.</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-text-light uppercase tracking-wide">
                  Minimum Spend Threshold (IDR)
                </label>
                <input
                  type="number"
                  min="0"
                  value={minimumSpend}
                  onChange={(e) => setMinimumSpend(Number(e.target.value))}
                  className={inputClass}
                />
                <p className="text-xs text-muted">Campaigns below this spend are monitored only.</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-text-light uppercase tracking-wide">
                  Budget Reallocation
                </label>
                <select
                  value={reallocationPercentage}
                  onChange={(e) => setReallocationPercentage(Number(e.target.value))}
                  className={inputClass}
                >
                  <option value="10">10% — Conservative</option>
                  <option value="15">15% — Moderate</option>
                  <option value="20">20% — Aggressive</option>
                </select>
                <p className="text-xs text-muted">% to increase or decrease budget per recommendation.</p>
              </div>

            </div>
          </Card>
        </section>

        {/* ── Step 3: Results ─────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="flex items-center justify-center w-7 h-7 rounded-full bg-primary text-white text-xs font-bold shrink-0">
                3
              </span>
              <h2 className="text-sm font-semibold text-text-light uppercase tracking-widest">Results</h2>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
            {/* Period selector */}
            {hasData && availablePeriods.length > 1 && (
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-muted whitespace-nowrap">
                  {view === 'weekly' ? 'Week' : view === 'biweekly' ? 'Biweek' : 'Month'}:
                </label>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      const idx = availablePeriods.indexOf(selectedPeriod ?? '')
                      if (idx > 0) setSelectedPeriod(availablePeriods[idx - 1])
                    }}
                    disabled={availablePeriods.indexOf(selectedPeriod ?? '') <= 0}
                    className="w-6 h-6 flex items-center justify-center rounded border border-border bg-surface text-muted hover:text-text hover:border-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    aria-label="Previous period"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                    </svg>
                  </button>
                  <select
                    value={selectedPeriod ?? ''}
                    onChange={(e) => setSelectedPeriod(e.target.value)}
                    className="rounded-lg border border-border bg-surface px-2 py-1 text-xs font-medium text-text focus:outline-none focus:ring-2 focus:ring-primary transition max-w-[180px]"
                  >
                    {availablePeriods.map((p, i) => (
                      <option key={p} value={p}>
                        {p}{i === availablePeriods.length - 1 ? ' (latest)' : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => {
                      const idx = availablePeriods.indexOf(selectedPeriod ?? '')
                      if (idx < availablePeriods.length - 1) setSelectedPeriod(availablePeriods[idx + 1])
                    }}
                    disabled={availablePeriods.indexOf(selectedPeriod ?? '') >= availablePeriods.length - 1}
                    className="w-6 h-6 flex items-center justify-center rounded border border-border bg-surface text-muted hover:text-text hover:border-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    aria-label="Next period"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  </button>
                </div>
              </div>
            )}
            {/* View tabs */}
            <div className="flex items-center gap-1 bg-surface border border-border rounded-lg p-1">
              {(['weekly', 'biweekly', 'monthly'] as ViewMode[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setView(tab)}
                  disabled={tab === 'biweekly' && weeklyRows.length === 0}
                  title={tab === 'biweekly' && weeklyRows.length === 0 ? 'Upload weekly data first' : undefined}
                  className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                    view === tab
                      ? 'bg-primary text-white shadow-sm'
                      : 'text-muted hover:text-text'
                  }`}
                >
                  {tab === 'weekly' ? 'Weekly' : tab === 'biweekly' ? 'Biweekly' : 'Monthly'}
                </button>
              ))}
            </div>
          </div>
          </div>

          {!hasData ? (
            /* Empty state */
            <Card className="flex flex-col items-center justify-center gap-4 py-16 text-center">
              <svg className="w-12 h-12 text-border" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              <div>
                <p className="font-semibold text-text">
                  {view === 'biweekly' ? 'No biweekly data available' : `No ${view} data uploaded yet`}
                </p>
                <p className="text-sm text-muted mt-1">
                  {view === 'biweekly'
                    ? 'Upload a weekly CSV file — biweekly periods are aggregated automatically from your weekly data.'
                    : <>Upload a <strong>{view}</strong> CSV file above to see your analysis.</>
                  }
                </p>
              </div>
            </Card>
          ) : (
            <div className="flex flex-col gap-6">

              {/* ── Unified Scorecard ─────────────────────────────────────── */}
              <Card>
                {/* Row 1 — Performance */}
                <div className="px-5 pt-4 pb-1">
                  <p className="text-[10px] font-semibold text-muted uppercase tracking-widest">Performance</p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 divide-x-0 sm:divide-x divide-border">
                  <div className="px-5 py-4">
                    <MetricTile
                      label="Total Spend"
                      value={formatCurrency(metrics.totalSpend)}
                      tooltip="Total amount spent across all campaigns in the selected period."
                    />
                  </div>
                  <div className="px-5 py-4">
                    <MetricTile
                      label="Total Revenue"
                      value={formatCurrency(metrics.totalRevenue)}
                      tooltip="Total conversion value (revenue) generated by all campaigns in the selected period."
                    />
                  </div>
                  <div className="px-5 py-4">
                    <MetricTile
                      label="Avg ROAS"
                      value={formatRoas(metrics.averageRoas)}
                      tooltip="Return On Ad Spend: Total Revenue ÷ Total Spend. Shows how much revenue each IDR of ad spend generates overall."
                    />
                  </div>
                  <div className="px-5 py-4">
                    <MetricTile
                      label="Avg Daily Spend"
                      value={avgDailySpend !== null ? formatCurrency(avgDailySpend) : '—'}
                  sub={
                    selectedPeriod
                      ? view === 'weekly'
                        ? 'per day · 7-day week'
                        : view === 'biweekly'
                        ? 'per day · 14-day biweek'
                        : `per day · ${getDaysInPeriod(selectedPeriod, view)}-day month`
                      : undefined
                  }
                  tooltip={`Total spend ÷ days in the selected ${view === 'weekly' ? 'week (7 days)' : view === 'biweekly' ? 'biweekly period (14 days)' : 'month'}. Use this as your daily budget cap in Google Ads.`}
                      alignRight
                    />
                  </div>
                </div>

                <Divider />

                {/* Row 2 — Incremental */}
                <div className="px-5 pt-4 pb-1">
                  <p className="text-[10px] font-semibold text-muted uppercase tracking-widest">Incremental (vs prior period)</p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 divide-y sm:divide-y-0 divide-x-0 sm:divide-x divide-border">
                  <div className="px-5 py-4">
                    <MetricTile
                      label="Incr. Spend"
                      value={formatCurrency(metrics.totalIncrementalSpend)}
                      tooltip="Additional spend compared to the previous period — the marginal investment being evaluated."
                    />
                  </div>
                  <div className="px-5 py-4">
                    <MetricTile
                      label="Incr. Revenue"
                      value={formatCurrency(metrics.totalIncrementalRevenue)}
                      tooltip="Additional revenue generated by the incremental spend. Positive means the extra spend is paying off."
                    />
                  </div>
                  <div className="px-5 py-4 col-span-2 sm:col-span-1">
                    <MetricTile
                      label="Overall iROAS"
                      value={formatRoas(metrics.overallIncrementalRoas)}
                      accent={
                        metrics.overallIncrementalRoas === null
                          ? undefined
                          : metrics.overallIncrementalRoas >= targetIncrementalRoas
                          ? '#15803d'
                          : '#b91c1c'
                      }
                      sub={`target: ${targetIncrementalRoas}x`}
                      tooltip={`Incremental Revenue ÷ Incremental Spend. Measures efficiency of additional spend only. Target is ${targetIncrementalRoas}x. Green = above target, Red = below.`}
                      alignRight
                    />
                  </div>
                </div>

                <Divider />

                {/* Row 3 — Campaign categories */}
                <div className="px-5 pt-4 pb-1">
                  <p className="text-[10px] font-semibold text-muted uppercase tracking-widest">Campaign breakdown</p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 divide-x-0 sm:divide-x divide-border pb-2">
                  {(Object.keys(CATEGORY_COLORS) as Category[]).map((cat) => (
                    <div key={cat} className="px-5 py-4 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: CATEGORY_COLORS[cat] }} />
                        <span className="text-sm font-medium text-text truncate">{cat}</span>
                      </div>
                      <span className="text-2xl font-bold tabular-nums shrink-0" style={{ color: CATEGORY_COLORS[cat] }}>
                        {metrics.counts[cat]}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Consolidated recommendations */}
              <RecommendationPanel
                rows={consolidatedRows}
                view={view}
                targetIncrementalRoas={targetIncrementalRoas}
                selectedPeriod={selectedPeriod}
                totalPeriods={availablePeriods.length}
                decisionCadence={decisionCadence}
                onAction={handleAction}
              />

              {/* Budget summary */}
              <BudgetSummary analyzedRows={analyzedRows} />

              {/* Charts 2×2 */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <ChartCard title="Spend vs Revenue by Period">
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                    <XAxis dataKey="period" tick={{ fontSize: 10, fill: '#78716c' }} />
                    <YAxis
                      tickFormatter={(v) => `${(Number(v) / 1e6).toFixed(0)}M`}
                      tick={{ fontSize: 10, fill: '#78716c' }}
                    />
                    <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="spend" stroke="#1d4ed8" strokeWidth={2} dot={false} name="Spend" />
                    <Line type="monotone" dataKey="revenue" stroke="#15803d" strokeWidth={2} dot={false} name="Revenue" />
                  </LineChart>
                </ChartCard>

                <ChartCard title="ROAS vs Incremental ROAS by Campaign">
                  <BarChart data={roasData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: '#78716c' }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: '#78716c' }} width={90} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="current" fill="#1d4ed8" radius={[0, 4, 4, 0]} name="Current ROAS" />
                    <Bar dataKey="incremental" fill="#f59e0b" radius={[0, 4, 4, 0]} name="Incremental ROAS" />
                  </BarChart>
                </ChartCard>

                <ChartCard title="Campaign Distribution by Category">
                  <PieChart>
                    <Tooltip />
                    <Pie
                      data={categoryData}
                      dataKey="value"
                      nameKey="name"
                      outerRadius={85}
                      label={({ name, percent }) =>
                        percent != null ? `${name} ${(percent * 100).toFixed(0)}%` : name
                      }
                      labelLine={false}
                    >
                      {categoryData.map((entry) => (
                        <Cell key={entry.name} fill={CATEGORY_COLORS[entry.name as Category]} />
                      ))}
                    </Pie>
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ChartCard>

                <ChartCard title="Recommended Budget Change by Campaign">
                  <BarChart data={budgetChangeData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" horizontal={false} />
                    <XAxis
                      type="number"
                      tickFormatter={(v) => `${(Number(v) / 1e6).toFixed(1)}M`}
                      tick={{ fontSize: 10, fill: '#78716c' }}
                    />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: '#78716c' }} width={90} />
                    <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                    <Bar dataKey="change" radius={[0, 4, 4, 0]} name="Budget Change">
                      {budgetChangeData.map((entry, i) => (
                        <Cell key={i} fill={entry.change >= 0 ? '#15803d' : '#b91c1c'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ChartCard>
              </div>

              {/* Historical data table (collapsible) */}
              <div className="bg-surface border border-border rounded-xl shadow-sm overflow-hidden">
                <button
                  onClick={() => setShowHistorical((v) => !v)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left cursor-pointer hover:bg-surface-2 transition-colors"
                >
                  <div>
                    <p className="text-sm font-semibold text-text">Full Historical Data</p>
                    <p className="text-xs text-muted mt-0.5">
                      All {analyzedRows.length} rows across every period — used as the basis for recommendations above
                    </p>
                  </div>
                  <svg
                    className={`w-4 h-4 text-muted shrink-0 transition-transform ${showHistorical ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {showHistorical && (
                  <div className="border-t border-border">
                    <AnalysisTable rows={analyzedRows} view={view} />
                  </div>
                )}
              </div>

            </div>
          )}
        </section>
      </div>
    </div>
  )
}
