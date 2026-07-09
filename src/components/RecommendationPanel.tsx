'use client'

import { Fragment, useState } from 'react'
import type { Category, ConsolidatedRow, ViewMode } from '@/lib/roas'
import {
  CATEGORY_COLORS,
  formatCurrency,
  formatPct,
  formatRoas,
} from '@/lib/roas'

type Props = {
  rows: ConsolidatedRow[]
  view: ViewMode
  targetIncrementalRoas: number
  selectedPeriod: string | null
  totalPeriods: number
}

const CATEGORY_BG: Record<Category, string> = {
  Scale: 'bg-scale-bg text-scale border-scale/30',
  Maintain: 'bg-maintain-bg text-maintain border-maintain/30',
  Reduce: 'bg-reduce-bg text-reduce border-reduce/30',
  Monitor: 'bg-monitor-bg text-monitor border-monitor/30',
}

const CONFIDENCE_STYLE: Record<'High' | 'Medium' | 'Low', string> = {
  High: 'bg-scale-bg text-scale',
  Medium: 'bg-monitor-bg text-monitor',
  Low: 'bg-surface-2 text-muted',
}

function TrendBadge({ value, suffix = '' }: { value: number | null; suffix?: string }) {
  if (value === null || !Number.isFinite(value)) {
    return <span className="text-muted text-xs">N/A</span>
  }
  const isPositive = value > 0
  const isNeutral = Math.abs(value) < 0.01
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-semibold ${
        isNeutral ? 'text-muted' : isPositive ? 'text-scale' : 'text-reduce'
      }`}
    >
      {!isNeutral && (
        <svg
          className={`w-3 h-3 shrink-0 ${isPositive ? '' : 'rotate-180'}`}
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
      {isPositive ? '+' : ''}{value.toFixed(1)}{suffix}
    </span>
  )
}

export function RecommendationPanel({ rows, view, targetIncrementalRoas, selectedPeriod, totalPeriods }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<'All' | Category>('All')

  const toggleExpand = (campaign: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(campaign)) next.delete(campaign)
      else next.add(campaign)
      return next
    })
  }

  const filtered = filter === 'All' ? rows : rows.filter((r) => r.category === filter)
  const counts = rows.reduce(
    (acc, r) => { acc[r.category] = (acc[r.category] ?? 0) + 1; return acc },
    {} as Record<Category, number>,
  )

  const periodLabel = view === 'weekly' ? 'week' : 'month'

  return (
    <div className="bg-surface border border-border rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-text">
            Consolidated Recommendations
          </p>
          <p className="text-xs text-muted mt-0.5">
            {selectedPeriod
              ? <>
                  Showing <span className="font-semibold text-text">{selectedPeriod}</span>
                  {' '}as current {periodLabel}, using{' '}
                  {totalPeriods > 1
                    ? <>{totalPeriods - 1} prior {periodLabel}{totalPeriods - 1 !== 1 ? 's' : ''} as historical basis</>
                    : <>no prior {periodLabel}s — first period in dataset</>
                  }
                </>
              : <>One recommendation per campaign based on full historical context.</>
            }
          </p>
        </div>
        {/* Filter pills */}
        <div className="flex flex-wrap gap-1.5 shrink-0">
          {(['All', 'Scale', 'Maintain', 'Reduce', 'Monitor'] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={`px-3 py-1 text-xs font-semibold rounded-full border transition-colors cursor-pointer ${
                filter === cat
                  ? cat === 'All'
                    ? 'bg-primary text-white border-primary'
                    : `${CATEGORY_BG[cat as Category]} border`
                  : 'bg-surface-2 border-border text-muted hover:text-text'
              }`}
            >
              {cat}
              {cat !== 'All' && counts[cat as Category]
                ? <span className="ml-1 opacity-60">({counts[cat as Category]})</span>
                : null}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px]">
          <thead className="bg-surface-2 border-b border-border">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wide">Campaign</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wide">Latest {periodLabel === 'week' ? 'Week' : 'Month'}</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-muted uppercase tracking-wide">Latest Spend</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-muted uppercase tracking-wide">Latest ROAS</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-muted uppercase tracking-wide">Incr. ROAS</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-muted uppercase tracking-wide">vs History</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-muted uppercase tracking-wide">Confidence</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wide">Action</th>
              <th className="px-4 py-3 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => {
              const isExpanded = expanded.has(row.campaign)
              const iRoasOk =
                row.incrementalRoas !== null && row.incrementalRoas >= targetIncrementalRoas

              return (
                <Fragment key={row.campaign}>
                  <tr
                    className="border-t border-border hover:bg-surface-2 transition-colors cursor-pointer"
                    onClick={() => toggleExpand(row.campaign)}
                  >
                    {/* Campaign name + category badge */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: CATEGORY_COLORS[row.category] }}
                        />
                        <span className="text-sm font-medium text-text max-w-[160px] truncate" title={row.campaign}>
                          {row.campaign}
                        </span>
                      </div>
                    </td>

                    {/* Latest period */}
                    <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                      {row.latestPeriod}
                    </td>

                    {/* Latest spend + trend vs historical avg */}
                    <td className="px-4 py-3 text-right">
                      <p className="text-sm font-semibold text-text">{formatCurrency(row.latestSpend)}</p>
                      <TrendBadge value={row.spendTrend} suffix="% vs avg" />
                    </td>

                    {/* Latest ROAS + ROAS trend */}
                    <td className="px-4 py-3 text-right">
                      <p className="text-sm font-semibold text-text">{formatRoas(row.latestRoas)}</p>
                      <TrendBadge value={row.rroasTrend} suffix=" vs avg" />
                    </td>

                    {/* Incremental ROAS */}
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`text-sm font-bold ${
                          row.incrementalRoas === null
                            ? 'text-muted'
                            : iRoasOk
                            ? 'text-scale'
                            : 'text-reduce'
                        }`}
                      >
                        {formatRoas(row.incrementalRoas)}
                      </span>
                    </td>

                    {/* Historical basis */}
                    <td className="px-4 py-3 text-center">
                      {row.historicalPeriods > 0 ? (
                        <span className="text-xs text-muted">
                          {row.historicalPeriods} {periodLabel}{row.historicalPeriods !== 1 ? 's' : ''}
                        </span>
                      ) : (
                        <span className="text-xs text-muted italic">First period</span>
                      )}
                    </td>

                    {/* Confidence */}
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${CONFIDENCE_STYLE[row.confidence]}`}
                      >
                        {row.confidence}
                      </span>
                    </td>

                    {/* Category + recommended action */}
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border ${CATEGORY_BG[row.category]}`}
                      >
                        {row.category}
                      </span>
                      <p className="text-xs text-muted mt-1 max-w-[200px] truncate">{row.recommendation}</p>
                    </td>

                    {/* Expand chevron */}
                    <td className="px-3 py-3">
                      <svg
                        className={`w-4 h-4 text-muted transition-transform ${isExpanded ? 'rotate-180' : ''}`}
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

                  {/* Expanded detail */}
                  {isExpanded && (
                    <tr>
                      <td colSpan={9} className="border-t border-border bg-surface-2 px-5 py-4">
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                          {/* Latest period */}
                          <div className="flex flex-col gap-0.5">
                            <p className="text-xs text-muted font-medium">Latest Revenue</p>
                            <p className="text-sm font-semibold text-text">{formatCurrency(row.latestRevenue)}</p>
                          </div>
                          {/* Incremental */}
                          <div className="flex flex-col gap-0.5">
                            <p className="text-xs text-muted font-medium">Incr. Spend (vs prev {periodLabel})</p>
                            <p className={`text-sm font-semibold ${(row.incrementalSpend ?? 0) >= 0 ? 'text-text' : 'text-reduce'}`}>
                              {formatCurrency(row.incrementalSpend)}
                            </p>
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <p className="text-xs text-muted font-medium">Incr. Revenue (vs prev {periodLabel})</p>
                            <p className={`text-sm font-semibold ${(row.incrementalRevenue ?? 0) >= 0 ? 'text-scale' : 'text-reduce'}`}>
                              {formatCurrency(row.incrementalRevenue)}
                            </p>
                          </div>
                          {/* Historical averages */}
                          <div className="flex flex-col gap-0.5">
                            <p className="text-xs text-muted font-medium">Hist. Avg Spend</p>
                            <p className="text-sm font-semibold text-text">{formatCurrency(row.historicalAvgSpend)}</p>
                            <p className="text-xs text-muted">over {row.historicalPeriods} {periodLabel}{row.historicalPeriods !== 1 ? 's' : ''}</p>
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <p className="text-xs text-muted font-medium">Hist. Avg Revenue</p>
                            <p className="text-sm font-semibold text-text">{formatCurrency(row.historicalAvgRevenue)}</p>
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <p className="text-xs text-muted font-medium">Hist. Avg ROAS</p>
                            <p className="text-sm font-semibold text-text">{formatRoas(row.historicalAvgRoas)}</p>
                          </div>
                          {/* Spend change */}
                          <div className="flex flex-col gap-0.5">
                            <p className="text-xs text-muted font-medium">Spend vs Hist. Avg</p>
                            <p className="text-sm font-semibold text-text">{formatPct(row.spendTrend)}</p>
                          </div>
                          {/* Recommended spend */}
                          <div className="flex flex-col gap-0.5">
                            <p className="text-xs text-muted font-medium">Recommended Budget</p>
                            <p className="text-sm font-bold text-text">{formatCurrency(row.recommendedSpend)}</p>
                          </div>
                          {/* Reason — spans full width */}
                          <div className="col-span-2 sm:col-span-3 lg:col-span-4 flex flex-col gap-0.5">
                            <p className="text-xs text-muted font-medium">Why this recommendation?</p>
                            <p className="text-sm text-text leading-relaxed">{row.reason}</p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <p className="text-sm font-semibold text-text">No campaigns in this category</p>
            <p className="text-xs text-muted">Try a different filter.</p>
          </div>
        )}
      </div>
    </div>
  )
}
