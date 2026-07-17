'use client'

import type { ConsolidatedRow } from '@/lib/roas'
import { formatCurrency, isCampaignExcluded } from '@/lib/roas'

type Props = {
  // Consolidated rows: one entry per campaign for the CURRENT period.
  // These are already SBEC-gated (SBEC campaigns are Monitor, not Scale/Reduce)
  // but we defensively filter again here for belt-and-suspenders safety.
  consolidatedRows: ConsolidatedRow[]
}

export function BudgetSummary({ consolidatedRows }: Props) {
  // Defensive: exclude SBEC/excluded campaigns from Scale/Reduce lists.
  const scaleRows = consolidatedRows.filter(
    (r) => r.category === 'Scale' && !isCampaignExcluded(r.campaign),
  )
  const reduceRows = consolidatedRows.filter(
    (r) => r.category === 'Reduce' && !isCampaignExcluded(r.campaign),
  )

  const budgetFreed = reduceRows.reduce(
    (sum, r) => sum + Math.max(0, r.latestSpend - r.recommendedSpend),
    0,
  )
  const budgetNeeded = scaleRows.reduce(
    (sum, r) => sum + Math.max(0, r.recommendedSpend - r.latestSpend),
    0,
  )
  const net = budgetFreed - budgetNeeded

  return (
    <div className="bg-surface border border-border rounded-xl shadow-sm p-5">
      <p className="text-xs font-semibold text-text-light uppercase tracking-wide mb-4">
        Budget reallocation summary
      </p>

      {/* Summary stat row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
        <div className="flex flex-col gap-1 p-3 rounded-lg bg-reduce-bg">
          <span className="text-xs font-medium text-reduce uppercase tracking-wide">
            Freed from underperformers
          </span>
          <strong className="text-xl font-bold text-reduce">{formatCurrency(budgetFreed)}</strong>
          <span className="text-xs text-muted">
            {reduceRows.length} campaign{reduceRows.length !== 1 ? 's' : ''} to reduce
          </span>
        </div>

        <div className="flex flex-col gap-1 p-3 rounded-lg bg-scale-bg">
          <span className="text-xs font-medium text-scale uppercase tracking-wide">
            Needed for scale campaigns
          </span>
          <strong className="text-xl font-bold text-scale">{formatCurrency(budgetNeeded)}</strong>
          <span className="text-xs text-muted">
            {scaleRows.length} campaign{scaleRows.length !== 1 ? 's' : ''} to scale
          </span>
        </div>

        <div className="flex flex-col gap-1 p-3 rounded-lg bg-surface-2 border border-border">
          <span className="text-xs font-medium text-text-light uppercase tracking-wide">
            Net budget impact
          </span>
          <strong className={`text-xl font-bold ${net >= 0 ? 'text-scale' : 'text-reduce'}`}>
            {formatCurrency(Math.abs(net))}
            <span className="text-sm font-normal text-muted ml-1">
              {net >= 0 ? 'surplus' : 'shortfall'}
            </span>
          </strong>
          <span className="text-xs text-muted">after reallocation</span>
        </div>
      </div>

      {/* Scale campaign tags */}
      {scaleRows.length > 0 && (
        <div>
          <p className="text-xs font-medium text-text-light mb-2">
            Campaigns recommended for scaling
            <span className="text-muted font-normal ml-1">(current period only)</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {scaleRows.map((r) => (
              <span
                key={r.campaign}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 bg-scale-bg text-scale text-xs font-semibold"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-scale inline-block" />
                {r.campaign}: {formatCurrency(r.recommendedSpend)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Reduce campaign tags */}
      {reduceRows.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium text-text-light mb-2">
            Campaigns recommended for reduction
            <span className="text-muted font-normal ml-1">(current period only)</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {reduceRows.map((r) => (
              <span
                key={r.campaign}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 bg-reduce-bg text-reduce text-xs font-semibold"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-reduce inline-block" />
                {r.campaign}: {formatCurrency(r.recommendedSpend)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
