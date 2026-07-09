'use client'

import type { AnalyzedRow, ViewMode } from '@/lib/roas'
import { CATEGORY_COLORS, formatCurrency, formatRoas } from '@/lib/roas'

const HEADINGS = [
  'Period',
  'Campaign',
  'Current Spend',
  'Previous Spend',
  'Incremental Spend',
  'Current Revenue',
  'Previous Revenue',
  'Incremental Revenue',
  'Current ROAS',
  'Previous ROAS',
  'Incremental ROAS',
  'Performance Category',
  'Budget Recommendation',
]

type Props = {
  rows: AnalyzedRow[]
  view: ViewMode
}

export function AnalysisTable({ rows, view }: Props) {
  return (
    <div className="bg-surface border border-border rounded-[22px] shadow-[0_16px_40px_rgba(100,116,139,0.12)] p-6 overflow-auto">
      <h2 className="text-base font-extrabold text-[#0f172a] mb-5">
        {view === 'weekly' ? 'Weekly' : 'Monthly'} Analysis Table
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1500px] border-collapse">
          <thead>
            <tr>
              {HEADINGS.map((h) => (
                <th
                  key={h}
                  className="sticky top-0 bg-subtle text-muted text-[0.75rem] font-extrabold uppercase tracking-wide px-3 py-3 border-b border-border text-left whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={`${row.period}-${row.campaign}`}
                className="hover:bg-subtle transition-colors"
              >
                <td className="px-3 py-3 border-b border-border whitespace-nowrap text-sm">
                  {row.period}
                </td>
                <td className="px-3 py-3 border-b border-border whitespace-nowrap text-sm font-semibold">
                  {row.campaign}
                </td>
                <td className="px-3 py-3 border-b border-border whitespace-nowrap text-sm">
                  {formatCurrency(row.currentSpend)}
                </td>
                <td className="px-3 py-3 border-b border-border whitespace-nowrap text-sm">
                  {formatCurrency(row.previousSpend)}
                </td>
                <td
                  className={`px-3 py-3 border-b border-border whitespace-nowrap text-sm font-bold ${
                    (row.incrementalSpend ?? 0) < 0 ? 'text-reduce' : ''
                  }`}
                >
                  {formatCurrency(row.incrementalSpend)}
                </td>
                <td className="px-3 py-3 border-b border-border whitespace-nowrap text-sm">
                  {formatCurrency(row.currentRevenue)}
                </td>
                <td className="px-3 py-3 border-b border-border whitespace-nowrap text-sm">
                  {formatCurrency(row.previousRevenue)}
                </td>
                <td
                  className={`px-3 py-3 border-b border-border whitespace-nowrap text-sm font-bold ${
                    (row.incrementalRevenue ?? 0) < 0 ? 'text-reduce' : ''
                  }`}
                >
                  {formatCurrency(row.incrementalRevenue)}
                </td>
                <td className="px-3 py-3 border-b border-border whitespace-nowrap text-sm">
                  {formatRoas(row.currentRoas)}
                </td>
                <td className="px-3 py-3 border-b border-border whitespace-nowrap text-sm">
                  {formatRoas(row.previousRoas)}
                </td>
                <td className="px-3 py-3 border-b border-border whitespace-nowrap text-sm">
                  {formatRoas(row.incrementalRoas)}
                </td>
                <td className="px-3 py-3 border-b border-border whitespace-nowrap">
                  <span
                    title={row.reason}
                    className="inline-block rounded-full px-3 py-1 text-white text-xs font-extrabold"
                    style={{ background: CATEGORY_COLORS[row.category] }}
                  >
                    {row.category}
                  </span>
                </td>
                <td className="px-3 py-3 border-b border-border whitespace-nowrap text-sm">
                  {row.recommendation}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <p className="text-center text-muted font-extrabold py-10">
            Upload a {view} CSV to begin.
          </p>
        )}
      </div>
    </div>
  )
}
