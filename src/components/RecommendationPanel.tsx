'use client'

import { Fragment, useState } from 'react'
import type { Category, ConsolidatedRow, DecisionCadence, ViewMode } from '@/lib/roas'
import { CADENCE_DAYS, CATEGORY_COLORS, formatCurrency, formatPct, formatRoas } from '@/lib/roas'
import { PowerCurveChart } from '@/components/PowerCurveChart'

// ---------------------------------------------------------------------------
// Tiny reusable pieces
// ---------------------------------------------------------------------------

function Tooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false)
  return (
    <span
      className="relative inline-flex items-center"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <svg
        className="w-3 h-3 text-muted ml-1 cursor-help shrink-0"
        fill="currentColor"
        viewBox="0 0 20 20"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
          clipRule="evenodd"
        />
      </svg>
      {show && (
        <span className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-[100] w-52 rounded-lg bg-[#1c1917] text-white text-xs leading-relaxed p-3 shadow-xl pointer-events-none whitespace-normal">
          <span className="absolute bottom-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-b-4 border-l-transparent border-r-transparent border-b-[#1c1917]" />
          {text}
        </span>
      )}
    </span>
  )
}

function TrendBadge({ value, suffix = '' }: { value: number | null; suffix?: string }) {
  if (value === null || !Number.isFinite(value))
    return <span className="text-xs text-muted">—</span>
  const isNeutral = Math.abs(value) < 0.01
  const isPos = value > 0
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium ${
        isNeutral ? 'text-muted' : isPos ? 'text-scale' : 'text-reduce'
      }`}
    >
      {!isNeutral && (
        <svg
          className={`w-2.5 h-2.5 shrink-0 ${isPos ? '' : 'rotate-180'}`}
          fill="currentColor"
          viewBox="0 0 20 20"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M10 17a.75.75 0 01-.75-.75V5.612L5.29 9.77a.75.75 0 01-1.08-1.04l5.25-5.5a.75.75 0 011.08 0l5.25 5.5a.75.75 0 11-1.08 1.04l-3.96-4.158V16.25A.75.75 0 0110 17z"
            clipRule="evenodd"
          />
        </svg>
      )}
      {isPos ? '+' : ''}
      {value.toFixed(1)}
      {suffix}
    </span>
  )
}

const CATEGORY_CHIP: Record<Category, string> = {
  Scale:    'bg-scale-bg text-scale border-scale/30',
  Maintain: 'bg-maintain-bg text-maintain border-maintain/30',
  Reduce:   'bg-reduce-bg text-reduce border-reduce/30',
  Monitor:  'bg-monitor-bg text-monitor border-monitor/30',
}

const CONFIDENCE_CHIP: Record<'High' | 'Medium' | 'Low', string> = {
  High:   'bg-scale-bg   text-scale',
  Medium: 'bg-monitor-bg text-monitor',
  Low:    'bg-surface-2  text-muted',
}

// ---------------------------------------------------------------------------
// Stat cell used inside the expanded drawer
// ---------------------------------------------------------------------------
function Stat({ label, value, sub, accent }: {
  label: string
  value: string
  sub?: string
  accent?: 'positive' | 'negative' | 'neutral'
}) {
  const valueColor =
    accent === 'positive' ? 'text-scale' :
    accent === 'negative' ? 'text-reduce' :
    'text-text'
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-[11px] font-medium text-muted uppercase tracking-wide leading-none">{label}</p>
      <p className={`text-sm font-semibold leading-snug ${valueColor}`}>{value}</p>
      {sub && <p className="text-[11px] text-muted leading-none">{sub}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type Props = {
  rows: ConsolidatedRow[]
  view: ViewMode
  targetIncrementalRoas: number
  selectedPeriod: string | null
  totalPeriods: number
  decisionCadence: DecisionCadence
  onAction: (campaign: string) => void
}

export function RecommendationPanel({
  rows,
  view,
  targetIncrementalRoas,
  selectedPeriod,
  totalPeriods,
  decisionCadence,
  onAction,
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<'All' | Category>('All')

  const toggle = (campaign: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(campaign) ? next.delete(campaign) : next.add(campaign)
      return next
    })

  const counts = rows.reduce(
    (acc, r) => { acc[r.category] = (acc[r.category] ?? 0) + 1; return acc },
    {} as Partial<Record<Category, number>>,
  )
  const filtered = filter === 'All' ? rows : rows.filter((r) => r.category === filter)
  const periodLabel = view === 'weekly' ? 'week' : 'month'

  return (
    <div className="bg-surface border border-border rounded-xl shadow-sm overflow-hidden">

      {/* ── Panel header ── */}
      <div className="px-5 py-4 border-b border-border">
        <div className="flex flex-col sm:flex-row sm:items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-text">Consolidated Recommendations</p>
            <p className="text-xs text-muted mt-0.5 leading-relaxed">
              {selectedPeriod ? (
                <>
                  Current {periodLabel}:{' '}
                  <span className="font-semibold text-text">{selectedPeriod}</span>
                  {totalPeriods > 1
                    ? ` — based on ${totalPeriods - 1} prior ${periodLabel}${totalPeriods - 1 !== 1 ? 's' : ''}`
                    : ' — no prior data yet'}
                  {' · '}
                  <span className="text-text font-medium">
                    {decisionCadence === 'biweekly' ? 'Biweekly' : 'Monthly'} cadence
                  </span>
                  {' — Scale/Reduce suppressed for '}
                  <span className="font-medium text-text">{CADENCE_DAYS[decisionCadence]} days</span>
                  {' after any action.'}
                </>
              ) : (
                'One recommendation per campaign based on full historical context.'
              )}
            </p>
          </div>

          {/* Filter pills */}
          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            {(['All', 'Scale', 'Maintain', 'Reduce', 'Monitor'] as const).map((cat) => (
              <button
                key={cat}
                onClick={() => setFilter(cat)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-full border transition-colors cursor-pointer ${
                  filter === cat
                    ? cat === 'All'
                      ? 'bg-primary text-white border-primary'
                      : CATEGORY_CHIP[cat as Category]
                    : 'bg-surface-2 border-border text-muted hover:text-text'
                }`}
              >
                {cat}
                {cat !== 'All' && counts[cat as Category]
                  ? <span className="ml-1 opacity-50">({counts[cat as Category]})</span>
                  : null}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse">
          <thead>
            <tr className="bg-surface-2 border-b border-border">
              {/* Campaign */}
              <th className="px-4 py-3 text-left min-w-[220px]">
                <span className="text-[11px] font-semibold text-muted uppercase tracking-wide">Campaign</span>
              </th>
              {/* Spend */}
              <th className="px-4 py-3 text-right">
                <span className="inline-flex items-center justify-end text-[11px] font-semibold text-muted uppercase tracking-wide">
                  Total Spend
                  <Tooltip text="Total spend for this campaign in the selected period." />
                </span>
              </th>
              {/* Avg Daily Spend */}
              <th className="px-4 py-3 text-right">
                <span className="inline-flex items-center justify-end text-[11px] font-semibold text-muted uppercase tracking-wide">
                  Daily Budget
                  <Tooltip text="Total spend divided by days in the period. Use this as your Google Ads daily budget." />
                </span>
              </th>
              {/* ROAS */}
              <th className="px-4 py-3 text-right">
                <span className="inline-flex items-center justify-end text-[11px] font-semibold text-muted uppercase tracking-wide">
                  ROAS
                  <Tooltip text="Return On Ad Spend: Revenue ÷ Spend for this period." />
                </span>
              </th>
              {/* iROAS */}
              <th className="px-4 py-3 text-right">
                <span className="inline-flex items-center justify-end text-[11px] font-semibold text-muted uppercase tracking-wide">
                  iROAS
                  <Tooltip text="Marginal iROAS from a log-log power-curve regression (b × ROAS at current spend). Falls back to rolling-window average or period-over-period delta when history is insufficient. The key signal for scale vs reduce decisions." />
                </span>
              </th>
              <th className="px-4 py-3 text-center">
                <span className="inline-flex items-center justify-center text-[11px] font-semibold text-muted uppercase tracking-wide">
                  Confidence
                  <Tooltip text="High = power-curve fit R²≥0.70. Medium = power-curve with lower R² or 4+ periods. Low = fewer than 6 periods, using rolling-avg fallback. Shows method and period count used." />
                </span>
              </th>
              {/* Confidence */}
              <th className="px-4 py-3 text-center">
                <span className="inline-flex items-center justify-center text-[11px] font-semibold text-muted uppercase tracking-wide">
                  Confidence
                  <Tooltip text="High = 4+ prior periods. Medium = 2–3. Low = 0–1. More history = more reliable." />
                </span>
              </th>
              {/* Action */}
              <th className="px-4 py-3 text-left">
                <span className="inline-flex items-center text-[11px] font-semibold text-muted uppercase tracking-wide">
                  Action
                  <Tooltip text="Recommended budget move. Expand the row for exact daily spend targets." />
                </span>
              </th>
              {/* Chevron */}
              <th className="w-10" />
            </tr>
          </thead>

          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center">
                  <p className="text-sm font-semibold text-text">No campaigns in this category</p>
                  <p className="text-xs text-muted mt-1">Try a different filter.</p>
                </td>
              </tr>
            ) : (
              filtered.map((row) => {
                const isExpanded = expanded.has(row.campaign)
                const iRoasOk =
                  row.incrementalRoas !== null && row.incrementalRoas >= targetIncrementalRoas

                return (
                  <Fragment key={row.campaign}>
                    {/* ── Main row ── */}
                    <tr
                      className={`border-t border-border cursor-pointer transition-colors ${
                        isExpanded ? 'bg-surface-2' : 'hover:bg-surface-2'
                      }`}
                      onClick={() => toggle(row.campaign)}
                    >
                      {/* Campaign name */}
                      <td className="px-4 py-3">
                        <div className="flex items-start gap-2">
                          <span
                            className="w-2 h-2 rounded-full shrink-0 mt-1"
                            style={{ backgroundColor: CATEGORY_COLORS[row.category] }}
                          />
                          <span className="text-sm font-medium text-text break-words">
                            {row.campaign}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted mt-0.5 pl-4">{row.latestPeriod}</p>
                      </td>

                      {/* Total spend */}
                      <td className="px-4 py-3 text-right">
                        <p className="text-sm font-semibold text-text tabular-nums">
                          {formatCurrency(row.latestSpend)}
                        </p>
                        <TrendBadge value={row.spendTrend} suffix="% vs avg" />
                      </td>

                      {/* Avg daily spend */}
                      <td className="px-4 py-3 text-right">
                        <p className="text-sm font-semibold text-text tabular-nums">
                          {formatCurrency(row.avgDailySpend)}
                        </p>
                        <p className="text-[11px] text-muted">per day</p>
                      </td>

                      {/* ROAS */}
                      <td className="px-4 py-3 text-right">
                        <p className="text-sm font-semibold text-text tabular-nums">
                          {formatRoas(row.latestRoas)}
                        </p>
                        <TrendBadge value={row.rroasTrend} suffix=" vs avg" />
                      </td>

                      {/* iROAS — shows marginal iROAS from regression, falls back to delta */}
                      <td className="px-4 py-3 text-right">
                        {(() => {
                          const displayIROAS = row.marginaliROAS ?? row.incrementalRoas
                          const isOk = displayIROAS !== null && displayIROAS >= targetIncrementalRoas
                          return (
                            <>
                              <p className={`text-sm font-bold tabular-nums ${displayIROAS === null ? 'text-muted' : isOk ? 'text-scale' : 'text-reduce'}`}>
                                {formatRoas(displayIROAS)}
                              </p>
                              <p className="text-[11px] text-muted">
                                {row.regressionMethod === 'power-curve'
                                  ? 'marginal · target: ' + targetIncrementalRoas
                                  : row.regressionMethod === 'rolling-avg'
                                    ? 'rolling avg · target: ' + targetIncrementalRoas
                                    : 'delta · target: ' + targetIncrementalRoas}
                              </p>
                            </>
                          )
                        })()}
                      </td>

                      {/* Confidence */}
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${CONFIDENCE_CHIP[row.confidence]}`}>
                          {row.confidence}
                        </span>
                        <p className="text-[11px] text-muted mt-0.5">
                          {row.regressionMethod === 'power-curve'
                            ? `curve · ${row.regressionPeriods}p${row.regressionRSquared !== null ? ` · R² ${row.regressionRSquared.toFixed(2)}` : ''}`
                            : row.regressionMethod === 'rolling-avg'
                              ? `rolling · ${row.regressionPeriods}p`
                              : row.historicalPeriods > 0
                                ? `${row.historicalPeriods} prior ${periodLabel}${row.historicalPeriods !== 1 ? 's' : ''}`
                                : 'first period'}
                        </p>
                      </td>

                      {/* Action */}
                      <td className="px-4 py-3">
                        {row.cooldownActive ? (
                          <div>
                            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold border bg-surface-2 border-border text-muted">
                              <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
                              </svg>
                              Monitoring
                            </span>
                            <p className="text-[11px] text-muted mt-1 leading-relaxed max-w-[180px]">
                              Next review in{' '}
                              <span className="font-semibold text-text">
                                {row.daysUntilNextReview}d
                              </span>
                            </p>
                          </div>
                        ) : row.belowThreshold ? (
                          <div>
                            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold border bg-surface-2 border-border text-muted">
                              Monitor (threshold)
                            </span>
                            <p className="text-[11px] text-muted mt-1 leading-relaxed max-w-[200px]">
                              Below minimum spend — no action
                            </p>
                          </div>
                        ) : row.category === 'Monitor' && row.confidence === 'Low' ? (
                          <div>
                            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold border bg-surface-2 border-border text-muted">
                              Monitor
                            </span>
                            <p className="text-[11px] text-muted mt-1 leading-relaxed max-w-[200px]">
                              {row.regressionRSquared !== null
                                ? `Low reliability — R² ${row.regressionRSquared.toFixed(2)}`
                                : 'Insufficient data for reliable signal'}
                            </p>
                          </div>
                        ) : row.category === 'Monitor' && row.recommendation.includes('SBEC') ? (
                          <div>
                            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold border bg-surface-2 border-border text-muted">
                              Monitor (excluded)
                            </span>
                            <p className="text-[11px] text-muted mt-1 leading-relaxed max-w-[200px]">
                              SBEC — no budget action
                            </p>
                          </div>
                        ) : (
                          <div>
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border ${CATEGORY_CHIP[row.category]}`}
                            >
                              {row.confidence === 'Medium' && (row.category === 'Scale' || row.category === 'Reduce')
                                ? `${row.category} ~`
                                : row.category}
                            </span>
                            <p className="text-[11px] text-muted mt-1 leading-relaxed max-w-[200px]">
                              {row.recommendation}
                            </p>
                          </div>
                        )}
                      </td>

                      {/* Chevron */}
                      <td className="px-3 py-3 text-center">
                        <svg
                          className={`w-4 h-4 text-muted transition-transform inline-block ${isExpanded ? 'rotate-180' : ''}`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                          aria-hidden="true"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </td>
                    </tr>

                    {/* ── Expanded drawer ── */}
                    {isExpanded && (
                      <tr>
                        <td colSpan={8} className="border-t border-border bg-background px-5 py-5">
                          <div className="flex flex-col gap-5">

                            {/* Row 1: Historical context */}
                            <div>
                              <p className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-3">
                                Historical Context
                              </p>
                              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-x-6 gap-y-4">
                                <Stat label="Latest Revenue" value={formatCurrency(row.latestRevenue)} />
                                <Stat
                                  label="Incr. Spend"
                                  value={formatCurrency(row.incrementalSpend)}
                                  sub={`vs prev ${periodLabel}`}
                                  accent={(row.incrementalSpend ?? 0) >= 0 ? 'positive' : 'negative'}
                                />
                                <Stat
                                  label="Incr. Revenue"
                                  value={formatCurrency(row.incrementalRevenue)}
                                  sub={`vs prev ${periodLabel}`}
                                  accent={(row.incrementalRevenue ?? 0) >= 0 ? 'positive' : 'negative'}
                                />
                                <Stat
                                  label="Hist. Avg Spend"
                                  value={formatCurrency(row.historicalAvgSpend)}
                                  sub={`${row.historicalPeriods} ${periodLabel}${row.historicalPeriods !== 1 ? 's' : ''}`}
                                />
                                <Stat label="Hist. Avg Revenue" value={formatCurrency(row.historicalAvgRevenue)} />
                                <Stat label="Hist. Avg ROAS" value={formatRoas(row.historicalAvgRoas)} />
                              </div>
                            </div>

                            {/* Divider */}
                            <div className="border-t border-border" />

                            {/* Row 1b: Regression Signal */}
                            <div>
                              <p className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-3">
                                iROAS Signal
                                {row.regressionMethod === 'power-curve' && (
                                  <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-maintain-bg text-maintain border border-maintain/30 normal-case tracking-normal">
                                    power-curve · {row.regressionPeriods} periods
                                    {row.regressionRSquared !== null && (
                                      <> · R&sup2; {row.regressionRSquared.toFixed(2)}</>
                                    )}
                                  </span>
                                )}
                                {row.regressionMethod === 'rolling-avg' && (
                                  <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-monitor-bg text-monitor border border-monitor/30 normal-case tracking-normal">
                                    rolling-avg fallback · {row.regressionPeriods} periods
                                  </span>
                                )}
                                {row.regressionMethod === 'power-curve' && row.curveValidation && (
                                  <span className={`ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border normal-case tracking-normal ${
                                    row.curveValidation.avgAbsErrPct !== null && row.curveValidation.avgAbsErrPct <= 10
                                      ? 'bg-scale-bg text-scale border-scale/30'
                                      : row.curveValidation.avgAbsErrPct !== null && row.curveValidation.avgAbsErrPct <= 25
                                        ? 'bg-maintain-bg text-maintain border-maintain/30'
                                        : 'bg-monitor-bg text-monitor border-monitor/30'
                                  }`}>
                                    validation: avg {row.curveValidation.avgAbsErrPct?.toFixed(0)}% err · {row.curveValidation.monthsChecked}mo
                                  </span>
                                )}
                                {row.regressionMethod === 'power-curve' && !row.curveValidation && (
                                  <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border bg-surface-2 text-muted border-border normal-case tracking-normal">
                                    validation: insufficient complete months
                                  </span>
                                )}
                                {row.regressionMethod === 'none' && (
                                  <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-surface-2 text-muted border border-border normal-case tracking-normal">
                                    insufficient data
                                  </span>
                                )}
                              </p>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <Stat
                                  label="Marginal iROAS"
                                  value={
                                    row.latestRevenue === 0 && row.latestSpend > 0
                                      ? 'N/A'
                                      : formatRoas(row.marginaliROAS)
                                  }
                                  sub={
                                    row.latestRevenue === 0 && row.latestSpend > 0
                                      ? 'zero revenue this period'
                                      : row.regressionMethod === 'power-curve'
                                        ? 'from curve derivative'
                                        : row.regressionMethod === 'rolling-avg'
                                          ? 'rolling avg fallback'
                                          : 'unavailable'
                                  }
                                  accent={
                                    row.latestRevenue === 0 && row.latestSpend > 0
                                      ? undefined
                                      : row.marginaliROAS !== null
                                        ? row.marginaliROAS >= targetIncrementalRoas
                                          ? 'positive'
                                          : 'negative'
                                        : undefined
                                  }
                                />
                                <Stat
                                  label="14-day iROAS"
                                  value={formatRoas(row.rolling14iROAS)}
                                  sub="trailing 2 periods"
                                  accent={
                                    row.rolling14iROAS !== null
                                      ? row.rolling14iROAS >= targetIncrementalRoas ? 'positive' : 'negative'
                                      : undefined
                                  }
                                />
                                <Stat
                                  label="28-day iROAS"
                                  value={formatRoas(row.rolling28iROAS)}
                                  sub="trailing 4 periods"
                                  accent={
                                    row.rolling28iROAS !== null
                                      ? row.rolling28iROAS >= targetIncrementalRoas ? 'positive' : 'negative'
                                      : undefined
                                  }
                                />
                                <Stat
                                  label="Period-over-Period"
                                  value={formatRoas(row.incrementalRoas)}
                                  sub="two-point delta"
                                  accent={
                                    row.incrementalRoas !== null
                                      ? row.incrementalRoas >= targetIncrementalRoas ? 'positive' : 'negative'
                                      : undefined
                                  }
                                />
                              </div>

                              {/* Recency-divergence warning ─────────────────────────────────────
                                  Fires when the long-run curve estimate and the trailing recent-
                                  window iROAS tell opposite stories, signalling a possible recent
                                  structural change not yet captured by the fitted curve.
                                  Suppressed for Monitor / Low-confidence rows where the action
                                  is already withheld regardless. -------------------------------- */}
                              {(() => {
                                // Only meaningful for power-curve with an actionable recommendation
                                if (
                                  row.regressionMethod !== 'power-curve' ||
                                  row.marginaliROAS === null ||
                                  row.confidence === 'Low' ||
                                  row.category === 'Monitor'
                                ) return null

                                // Prefer 14-day; fall back to 28-day
                                const trailingLabel = row.rolling14iROAS !== null ? '14-day' : '28-day'
                                const trailingValue = row.rolling14iROAS ?? row.rolling28iROAS
                                if (trailingValue === null) return null

                                const curve = row.marginaliROAS

                                // Trigger 1: sign mismatch
                                const signMismatch = (curve > 0 && trailingValue < 0) || (curve < 0 && trailingValue > 0)

                                // Trigger 2: magnitude divergence ≥ 2× (both same sign but far apart)
                                const magnitudeDivergence =
                                  !signMismatch &&
                                  Math.abs(curve) > 0 &&
                                  Math.abs(trailingValue - curve) / Math.abs(curve) >= 2

                                if (!signMismatch && !magnitudeDivergence) return null

                                const reason = signMismatch
                                  ? `sign mismatch — curve is ${curve > 0 ? 'positive' : 'negative'} but trailing is ${trailingValue > 0 ? 'positive' : 'negative'}`
                                  : `magnitude divergence — trailing differs from curve by ${(Math.abs(trailingValue - curve) / Math.abs(curve) * 100).toFixed(0)}%`

                                return (
                                  <p className="text-[11px] text-monitor leading-relaxed mt-3 px-3 py-2 rounded border border-monitor/30 bg-monitor-bg">
                                    <span className="font-semibold">Recency divergence ({reason}):</span>{' '}
                                    {trailingLabel} iROAS ({formatRoas(trailingValue)}) sharply disagrees with the long-run curve estimate ({formatRoas(curve)}) — this may indicate a recent change in campaign performance not yet reflected in the fitted curve. Investigate before acting on this recommendation.
                                  </p>
                                )
                              })()}

                              {/* Power-curve chart */}
                              <PowerCurveChart
                                chartPoints={row.chartPoints}
                                regressionCoeffs={row.regressionCoeffs}
                                marginaliROAS={row.marginaliROAS}
                                regressionMethod={row.regressionMethod}
                                currentPeriodSpend={row.latestSpend}
                                currentPeriodRevenue={row.latestRevenue}
                              />
                            </div>

                            {/* Divider */}
                            <div className="border-t border-border" />

                            {/* Row 2: Budget action */}
                            <div>
                              <p className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-3">
                                Budget Action
                              </p>
                              <div className="flex flex-col sm:flex-row gap-4">

                                {/* Recommended period budget */}
                                <div className="flex-1 flex flex-col gap-0.5 rounded-lg border border-border bg-surface px-4 py-3">
                                  <p className="text-[11px] font-medium text-muted uppercase tracking-wide">
                                    Recommended Period Budget
                                  </p>
                                  <p className="text-xl font-bold text-text tabular-nums">
                                    {formatCurrency(row.recommendedSpend)}
                                  </p>
                                  <p className="text-[11px] text-muted">
                                    {formatPct(row.spendTrend)} vs historical avg
                                  </p>
                                </div>

                                {/* Daily budget target — the key actionable cell */}
                                <div
                                  className={`flex-1 flex flex-col gap-0.5 rounded-lg border px-4 py-3 ${
                                    row.category === 'Scale'
                                      ? 'bg-scale-bg border-scale/30'
                                      : row.category === 'Reduce'
                                      ? 'bg-reduce-bg border-reduce/30'
                                      : 'bg-surface border-border'
                                  }`}
                                >
                                  <p className="text-[11px] font-semibold text-muted uppercase tracking-wide">
                                    Set Google Ads Daily Budget to
                                  </p>
                                  <p
                                    className={`text-2xl font-bold tabular-nums ${
                                      row.category === 'Scale'
                                        ? 'text-scale'
                                        : row.category === 'Reduce'
                                        ? 'text-reduce'
                                        : 'text-text'
                                    }`}
                                  >
                                    {formatCurrency(row.recommendedDailySpend)}
                                    <span className="text-sm font-normal text-muted ml-1">/ day</span>
                                  </p>
                                  {row.category === 'Monitor' ? (
                                    <p className="text-[11px] text-muted mt-1">
                                      No budget change needed — gather more data first.
                                    </p>
                                  ) : (
                                    <p className="text-xs font-medium mt-1">
                                      <span
                                        className={row.dailySpendDelta >= 0 ? 'text-scale' : 'text-reduce'}
                                      >
                                        {row.dailySpendDelta >= 0 ? '+' : ''}
                                        {formatCurrency(row.dailySpendDelta)} / day
                                      </span>
                                      <span className="text-muted font-normal ml-1">
                                        from current {formatCurrency(row.avgDailySpend)} / day
                                      </span>
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Divider */}
                            <div className="border-t border-border" />

                            {/* Row 3: Reasoning */}
                            <div>
                              <p className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">
                                Why this recommendation?
                              </p>
                              <p className="text-sm text-text leading-relaxed">{row.reason}</p>
                            </div>

                            {/* Divider */}
                            <div className="border-t border-border" />

                            {/* Row 4: Action tracking */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div>
                                <p className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">
                                  Budget Action Tracking
                                </p>
                                {row.cooldownActive ? (
                                  <p className="text-xs text-muted leading-relaxed">
                                    Last action:{' '}
                                    <span className="font-medium text-text">
                                      {row.lastActionDate ? new Date(row.lastActionDate).toLocaleDateString() : '—'}
                                    </span>
                                    {' · '}
                                    <span className="font-medium text-monitor">
                                      Next review in {row.daysUntilNextReview} day{row.daysUntilNextReview !== 1 ? 's' : ''}
                                    </span>
                                    {' '}({decisionCadence === 'biweekly' ? 'Biweekly' : 'Monthly'} cadence)
                                  </p>
                                ) : row.lastActionDate ? (
                                  <p className="text-xs text-muted">
                                    Last action:{' '}
                                    <span className="font-medium text-text">
                                      {new Date(row.lastActionDate).toLocaleDateString()}
                                    </span>
                                    {' · Cooldown window has passed — a new recommendation is now active.'}
                                  </p>
                                ) : (
                                  <p className="text-xs text-muted">
                                    No action recorded yet. Click the button when you apply this recommendation in Google Ads.
                                  </p>
                                )}
                              </div>
                              {!row.cooldownActive && (row.category === 'Scale' || row.category === 'Reduce') && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); onAction(row.campaign) }}
                                  className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-primary bg-primary-light text-primary px-3 py-2 text-xs font-semibold hover:bg-primary hover:text-white transition-colors cursor-pointer"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                  </svg>
                                  Mark as Actioned
                                </button>
                              )}
                            </div>

                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
