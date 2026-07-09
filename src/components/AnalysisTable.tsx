'use client'

import { Fragment, useState } from 'react'
import type { AnalyzedRow, Category, ViewMode } from '@/lib/roas'
import { CATEGORY_COLORS, formatCurrency, formatRoas } from '@/lib/roas'

type Props = {
  rows: AnalyzedRow[]
  view: ViewMode
}

type FilterCategory = 'All' | Category

const CATEGORY_BG: Record<Category, string> = {
  Scale: 'bg-scale-bg text-scale',
  Maintain: 'bg-maintain-bg text-maintain',
  Reduce: 'bg-reduce-bg text-reduce',
  Monitor: 'bg-monitor-bg text-monitor',
}

function Th({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={`px-3 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wide whitespace-nowrap ${className}`}>
      {children}
    </th>
  )
}

function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <td className={`px-3 py-3 text-sm text-text border-t border-border whitespace-nowrap ${className}`}>
      {children}
    </td>
  )
}

export function AnalysisTable({ rows, view }: Props) {
  const [filter, setFilter] = useState<FilterCategory>('All')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const filtered = filter === 'All' ? rows : rows.filter((r) => r.category === filter)

  const toggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const categories: FilterCategory[] = ['All', 'Scale', 'Maintain', 'Reduce', 'Monitor']
  const counts = rows.reduce((acc, r) => {
    acc[r.category] = (acc[r.category] ?? 0) + 1
    return acc
  }, {} as Record<Category, number>)

  return (
    <div className="overflow-hidden">
      {/* Table header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-b border-border bg-surface">
        <p className="text-sm font-semibold text-text">
          {view === 'weekly' ? 'Weekly' : 'Monthly'} campaign analysis
          <span className="ml-2 text-xs font-normal text-muted">{filtered.length} rows</span>
        </p>
        {/* Category filter pills */}
        <div className="flex flex-wrap gap-1.5">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={`px-3 py-1 text-xs font-semibold rounded-full transition-colors cursor-pointer ${
                filter === cat
                  ? cat === 'All'
                    ? 'bg-primary text-white'
                    : `${CATEGORY_BG[cat as Category]}`
                  : 'bg-surface-2 border border-border text-muted hover:text-text'
              }`}
            >
              {cat}
              {cat !== 'All' && counts[cat as Category] ? (
                <span className="ml-1 opacity-70">({counts[cat as Category]})</span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px]">
          <thead className="bg-surface-2">
            <tr>
              <Th>Period</Th>
              <Th>Campaign</Th>
              <Th>Current Spend</Th>
              <Th>Current Revenue</Th>
              <Th>Current ROAS</Th>
              <Th>Incr. ROAS</Th>
              <Th>Category</Th>
              <Th>Recommendation</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => {
              const key = `${row.period}-${row.campaign}`
              const isExpanded = expanded.has(key)
              return (
                <Fragment key={key}>
                  <tr className="hover:bg-surface-2 transition-colors">
                    <Td className="text-muted">{row.period}</Td>
                    <Td className="font-medium max-w-[180px] truncate">{row.campaign}</Td>
                    <Td>{formatCurrency(row.currentSpend)}</Td>
                    <Td>{formatCurrency(row.currentRevenue)}</Td>
                    <Td>{formatRoas(row.currentRoas)}</Td>
                    <Td>
                      <span
                        className={`font-semibold ${
                          row.incrementalRoas === null
                            ? 'text-muted'
                            : row.incrementalRoas >= 0
                            ? 'text-scale'
                            : 'text-reduce'
                        }`}
                      >
                        {formatRoas(row.incrementalRoas)}
                      </span>
                    </Td>
                    <Td>
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${CATEGORY_BG[row.category]}`}>
                        {row.category}
                      </span>
                    </Td>
                    <Td className="text-text-light max-w-[220px] truncate">{row.recommendation}</Td>
                    <Td>
                      <button
                        onClick={() => toggleExpand(key)}
                        className="text-muted hover:text-text transition-colors p-1 rounded cursor-pointer"
                        aria-label={isExpanded ? 'Collapse row' : 'Expand row'}
                      >
                        <svg className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    </Td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={9} className="px-5 py-4 border-t border-border bg-surface-2">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                          <div>
                            <p className="text-xs text-muted font-medium mb-0.5">Previous Spend</p>
                            <p className="font-semibold text-text">{formatCurrency(row.previousSpend)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted font-medium mb-0.5">Incremental Spend</p>
                            <p className={`font-semibold ${(row.incrementalSpend ?? 0) < 0 ? 'text-reduce' : 'text-text'}`}>
                              {formatCurrency(row.incrementalSpend)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted font-medium mb-0.5">Previous Revenue</p>
                            <p className="font-semibold text-text">{formatCurrency(row.previousRevenue)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted font-medium mb-0.5">Incremental Revenue</p>
                            <p className={`font-semibold ${(row.incrementalRevenue ?? 0) < 0 ? 'text-reduce' : 'text-text'}`}>
                              {formatCurrency(row.incrementalRevenue)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted font-medium mb-0.5">Previous ROAS</p>
                            <p className="font-semibold text-text">{formatRoas(row.previousRoas)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted font-medium mb-0.5">Recommended Spend</p>
                            <p className="font-semibold text-text">{formatCurrency(row.recommendedSpend)}</p>
                          </div>
                          <div className="col-span-2">
                            <p className="text-xs text-muted font-medium mb-0.5">Reason</p>
                            <p className="text-text">{row.reason}</p>
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
        {!filtered.length && (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <p className="text-sm font-semibold text-text">No results</p>
            <p className="text-xs text-muted">Try a different category filter.</p>
          </div>
        )}
      </div>
    </div>
  )
}
