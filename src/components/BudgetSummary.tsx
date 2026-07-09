'use client'

import type { AnalyzedRow } from '@/lib/roas'
import { formatCurrency } from '@/lib/roas'

type Props = {
  analyzedRows: AnalyzedRow[]
}

export function BudgetSummary({ analyzedRows }: Props) {
  const budgetAvailable = analyzedRows
    .filter((r) => r.category === 'Reduce')
    .reduce((sum, r) => sum + (r.currentSpend - r.recommendedSpend), 0)

  const scaleRows = analyzedRows.filter((r) => r.category === 'Scale')

  return (
    <div className="bg-surface border border-border rounded-[22px] shadow-[0_16px_40px_rgba(100,116,139,0.12)] p-6">
      <h2 className="text-base font-extrabold text-[#0f172a] mb-4">
        Budget Allocation Summary
      </h2>
      <div className="flex flex-col gap-2 text-sm">
        <p>
          <span className="font-extrabold">Total budget to reduce from underperforming campaigns:</span>{' '}
          {formatCurrency(budgetAvailable)}
        </p>
        <p>
          <span className="font-extrabold">Total budget available for reallocation:</span>{' '}
          {formatCurrency(budgetAvailable)}
        </p>
        <p>
          <span className="font-extrabold">Suggested campaigns to receive additional budget:</span>{' '}
          {scaleRows.map((r) => r.campaign).join(', ') || 'None yet'}
        </p>
      </div>
      {scaleRows.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-4">
          {scaleRows.map((r) => (
            <span
              key={`${r.period}-${r.campaign}`}
              className="inline-block rounded-full px-3 py-2 bg-primary text-white text-xs font-extrabold"
            >
              {r.campaign}: {formatCurrency(r.recommendedSpend)}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
