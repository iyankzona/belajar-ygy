export type ViewMode = 'weekly' | 'monthly'
export type Category = 'Scale' | 'Maintain' | 'Reduce' | 'Monitor'
export type DecisionCadence = 'biweekly' | 'monthly'
export const CADENCE_DAYS: Record<DecisionCadence, number> = { biweekly: 14, monthly: 30 }

export type RawRow = {
  period: string
  campaign: string
  cost: number
  revenue: number
}

export type AnalyzedRow = {
  period: string
  campaign: string
  currentSpend: number
  previousSpend: number | null
  incrementalSpend: number | null
  currentRevenue: number
  previousRevenue: number | null
  incrementalRevenue: number | null
  currentRoas: number | null
  previousRoas: number | null
  incrementalRoas: number | null
  category: Category
  reason: string
  recommendation: string
  recommendedSpend: number
}

// A consolidated, one-row-per-campaign summary based on the latest period
// and the full historical record for that campaign.
export type ConsolidatedRow = {
  campaign: string
  // latest period data
  latestPeriod: string
  latestSpend: number
  latestRevenue: number
  latestRoas: number | null
  // historical averages (all periods BEFORE the latest)
  historicalPeriods: number
  historicalAvgSpend: number | null
  historicalAvgRevenue: number | null
  historicalAvgRoas: number | null
  // trend: latest vs historical average
  spendTrend: number | null   // % change vs historical avg
  rroasTrend: number | null   // absolute change in ROAS vs historical avg
  // incremental metrics (latest vs immediately previous period)
  incrementalSpend: number | null
  incrementalRevenue: number | null
  incrementalRoas: number | null
  // daily spend breakdown
  daysInPeriod: number          // 7 for weekly, days-in-month for monthly
  avgDailySpend: number         // latestSpend / daysInPeriod
  recommendedDailySpend: number // recommendedSpend / daysInPeriod
  dailySpendDelta: number       // recommendedDailySpend - avgDailySpend
  // decision cadence / cooldown
  lastActionDate: string | null     // ISO date of last recorded action, if any
  cooldownActive: boolean           // true if within the cadence cooldown window
  daysUntilNextReview: number | null // days remaining in cooldown window
  // recommendation
  category: Category
  reason: string
  recommendation: string
  recommendedSpend: number
  confidence: 'High' | 'Medium' | 'Low'
}

export const CATEGORY_COLORS: Record<Category, string> = {
  Scale: '#16a34a',
  Maintain: '#2563eb',
  Reduce: '#dc2626',
  Monitor: '#f59e0b',
}

export const REQUIRED_COLUMNS: Record<ViewMode, string[]> = {
  weekly: ['Week', 'Campaign', 'Cost', 'Total conv. value', 'ROAS'],
  monthly: ['Month', 'Campaign', 'Cost', 'Total conv. value', 'ROAS'],
}

export const formatCurrency = (value: number | null | undefined) =>
  value === null || value === undefined || !Number.isFinite(value)
    ? 'N/A'
    : new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0,
      }).format(value)

export const formatRoas = (value: number | null | undefined) =>
  value === null || value === undefined || !Number.isFinite(value)
    ? 'N/A'
    : value.toFixed(2)

export const formatPct = (value: number | null | undefined) =>
  value === null || value === undefined || !Number.isFinite(value)
    ? 'N/A'
    : `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`

const parseNumber = (value: string | undefined) =>
  Number(String(value ?? '').replace(/[^0-9.-]/g, '')) || 0

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    const next = text[i + 1]

    if (char === '"' && quoted && next === '"') {
      cell += '"'
      i += 1
    } else if (char === '"') {
      quoted = !quoted
    } else if (char === ',' && !quoted) {
      row.push(cell.trim())
      cell = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i += 1
      row.push(cell.trim())
      if (row.some(Boolean)) rows.push(row)
      row = []
      cell = ''
    } else {
      cell += char
    }
  }

  row.push(cell.trim())
  if (row.some(Boolean)) rows.push(row)
  if (quoted) throw new Error('File cannot be parsed because it contains an unclosed quote.')
  return rows
}

export function loadRows(text: string, mode: ViewMode): RawRow[] {
  const parsed = parseCsv(text)
  if (parsed.length < 2) throw new Error('CSV file is empty or has no data rows.')

  const headers = parsed[0].map((h) => h.trim())
  const missing = REQUIRED_COLUMNS[mode].filter((col) => !headers.includes(col))
  if (missing.length) throw new Error(`Missing required column(s): ${missing.join(', ')}`)

  const indexes = Object.fromEntries(headers.map((h, i) => [h, i]))
  const periodColumn = mode === 'weekly' ? 'Week' : 'Month'

  return parsed
    .slice(1)
    .filter((row) => row.some(Boolean))
    .map((row) => ({
      period: row[indexes[periodColumn]] || '',
      campaign: row[indexes.Campaign] || 'Unspecified Campaign',
      cost: parseNumber(row[indexes.Cost]),
      revenue: parseNumber(row[indexes['Total conv. value']]),
    }))
    .filter((row) => row.period && row.campaign)
}

export function periodTime(period: string, mode: ViewMode): number {
  if (mode === 'monthly')
    return Date.parse(period.length === 7 ? `${period}-01` : period) || 0
  return Date.parse(period.replace(/ - .*/, '')) || Date.parse(period) || 0
}

/**
 * Returns the number of days in the given period string.
 * Weekly periods are always 7. Monthly periods are the actual days in that month.
 */
export function getDaysInPeriod(period: string, mode: ViewMode): number {
  if (mode === 'weekly') return 7
  // period format: "YYYY-MM" or "Jan 2025" or similar
  const ts = periodTime(period, mode)
  if (!ts) return 30
  const d = new Date(ts)
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
}

/** Returns all unique periods from the raw rows, sorted chronologically. */
export function getAvailablePeriods(rows: RawRow[], mode: ViewMode): string[] {
  const set = new Set(rows.map((r) => r.period))
  return Array.from(set).sort((a, b) => periodTime(a, mode) - periodTime(b, mode))
}

// Categorize a campaign given incremental ROAS, current ROAS, previous ROAS,
// minimum spend, and target iROAS.
function categorize(opts: {
  incrementalRoas: number | null
  currentRoas: number | null
  previousRoas: number | null
  currentSpend: number
  minimumSpend: number
  targetIncrementalRoas: number
  hasHistory: boolean
}): { category: Category; reason: string } {
  const { incrementalRoas, currentRoas, previousRoas, currentSpend, minimumSpend, targetIncrementalRoas, hasHistory } = opts

  if (!hasHistory) {
    return { category: 'Monitor', reason: 'Only one period of data — no historical basis for comparison yet.' }
  }
  if (currentSpend < minimumSpend) {
    return { category: 'Monitor', reason: 'Spend is below the minimum threshold — insufficient volume for reliable signal.' }
  }
  if (incrementalRoas === null) {
    return { category: 'Monitor', reason: 'No incremental spend observed — unable to compute incremental ROAS.' }
  }
  if (incrementalRoas <= 0) {
    return { category: 'Reduce', reason: 'Incremental ROAS is zero or negative — additional spend is generating no returns.' }
  }
  if (incrementalRoas >= targetIncrementalRoas * 1.05) {
    return { category: 'Scale', reason: 'Incremental ROAS comfortably exceeds target — campaign has strong marginal returns.' }
  }
  if (incrementalRoas >= targetIncrementalRoas * 0.85) {
    return { category: 'Maintain', reason: 'Incremental ROAS is close to target — campaign is performing at an efficient level.' }
  }
  if (
    currentRoas !== null &&
    previousRoas !== null &&
    Math.abs(currentRoas - previousRoas) <= targetIncrementalRoas * 0.1
  ) {
    return { category: 'Maintain', reason: 'ROAS is stable period-over-period even though incremental ROAS is slightly below target.' }
  }
  return { category: 'Reduce', reason: 'Incremental ROAS is materially below target — efficiency is declining with more spend.' }
}

export function analyzeRows(
  rows: RawRow[],
  mode: ViewMode,
  targetIncrementalRoas: number,
  minimumSpend: number,
  reallocationPercentage: number,
  selectedPeriod?: string,
): AnalyzedRow[] {
  // When a period is selected, limit rows to that period and all prior periods
  const cutoff = selectedPeriod ? periodTime(selectedPeriod, mode) : Infinity
  const filteredRows = rows.filter((r) => periodTime(r.period, mode) <= cutoff)

  const grouped = new Map<string, RawRow[]>()
  filteredRows.forEach((row) =>
    grouped.set(row.campaign, [...(grouped.get(row.campaign) || []), row]),
  )

  const output: AnalyzedRow[] = []

  grouped.forEach((campaignRows) => {
    campaignRows.sort(
      (a, b) => periodTime(a.period, mode) - periodTime(b.period, mode),
    )

    campaignRows.forEach((row, index) => {
      const previous = campaignRows[index - 1]
      const currentRoas = row.cost === 0 ? null : row.revenue / row.cost
      const previousRoas = previous
        ? previous.cost === 0 ? null : previous.revenue / previous.cost
        : null
      const incrementalSpend = previous ? row.cost - previous.cost : null
      const incrementalRevenue = previous ? row.revenue - previous.revenue : null
      const incrementalRoas =
        incrementalSpend && incrementalSpend > 0
          ? (incrementalRevenue ?? 0) / incrementalSpend
          : null

      const { category, reason } = categorize({
        incrementalRoas,
        currentRoas,
        previousRoas,
        currentSpend: row.cost,
        minimumSpend,
        targetIncrementalRoas,
        hasHistory: index > 0,
      })

      const multiplier =
        category === 'Scale'
          ? 1 + reallocationPercentage / 100
          : category === 'Reduce'
            ? 1 - reallocationPercentage / 100
            : 1
      const recommendedSpend = row.cost * multiplier

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
      })
    })
  })

  return output.sort(
    (a, b) =>
      periodTime(a.period, mode) - periodTime(b.period, mode) ||
      a.campaign.localeCompare(b.campaign),
  )
}

// ─── Consolidated recommendations ────────────────────────────────────────────
// Produces one row per campaign based on the latest period and ALL historical
// periods as context.

export function consolidateRows(
  rows: RawRow[],
  mode: ViewMode,
  targetIncrementalRoas: number,
  minimumSpend: number,
  reallocationPercentage: number,
  selectedPeriod?: string,
  lastActionDates: Record<string, string> = {},
  cadenceDays = 30,
): ConsolidatedRow[] {
  // Limit to rows up to and including the selected period
  const cutoff = selectedPeriod ? periodTime(selectedPeriod, mode) : Infinity
  const filteredRows = rows.filter((r) => periodTime(r.period, mode) <= cutoff)

  const grouped = new Map<string, RawRow[]>()
  filteredRows.forEach((row) =>
    grouped.set(row.campaign, [...(grouped.get(row.campaign) || []), row]),
  )

  const results: ConsolidatedRow[] = []

  grouped.forEach((campaignRows, campaign) => {
    campaignRows.sort(
      (a, b) => periodTime(a.period, mode) - periodTime(b.period, mode),
    )

    // The "current" period is either the selected one (if the campaign has data for it)
    // or the campaign's most recent period within the cutoff
    const latestIdx = selectedPeriod
      ? campaignRows.findLastIndex((r) => r.period === selectedPeriod)
      : -1
    const currentIdx = latestIdx !== -1 ? latestIdx : campaignRows.length - 1
    const latest = campaignRows[currentIdx]
    const previous = currentIdx > 0 ? campaignRows[currentIdx - 1] : null
    const historicalRows = campaignRows.slice(0, currentIdx) // all before current

    // Latest period metrics
    const latestRoas = latest.cost === 0 ? null : latest.revenue / latest.cost
    const prevRoas = previous ? (previous.cost === 0 ? null : previous.revenue / previous.cost) : null

    // Incremental: latest vs immediately previous period
    const incrementalSpend = previous ? latest.cost - previous.cost : null
    const incrementalRevenue = previous ? latest.revenue - previous.revenue : null
    const incrementalRoas =
      incrementalSpend !== null && incrementalSpend > 0
        ? (incrementalRevenue ?? 0) / incrementalSpend
        : null

    // Historical averages (all periods before latest)
    let historicalAvgSpend: number | null = null
    let historicalAvgRevenue: number | null = null
    let historicalAvgRoas: number | null = null

    if (historicalRows.length > 0) {
      historicalAvgSpend = historicalRows.reduce((s, r) => s + r.cost, 0) / historicalRows.length
      historicalAvgRevenue = historicalRows.reduce((s, r) => s + r.revenue, 0) / historicalRows.length
      const roasValues = historicalRows
        .filter((r) => r.cost > 0)
        .map((r) => r.revenue / r.cost)
      historicalAvgRoas = roasValues.length > 0
        ? roasValues.reduce((s, v) => s + v, 0) / roasValues.length
        : null
    }

    // Trend: latest vs historical average
    const spendTrend =
      historicalAvgSpend !== null && historicalAvgSpend > 0
        ? ((latest.cost - historicalAvgSpend) / historicalAvgSpend) * 100
        : null
    const rroasTrend =
      latestRoas !== null && historicalAvgRoas !== null
        ? latestRoas - historicalAvgRoas
        : null

    // Confidence: based on how many historical periods exist
    const confidence: 'High' | 'Medium' | 'Low' =
      historicalRows.length >= 4 ? 'High' : historicalRows.length >= 2 ? 'Medium' : 'Low'

    let { category, reason } = categorize({
      incrementalRoas,
      currentRoas: latestRoas,
      previousRoas: prevRoas,
      currentSpend: latest.cost,
      minimumSpend,
      targetIncrementalRoas,
      hasHistory: historicalRows.length > 0,
    })

    // Apply cooldown: suppress Scale/Reduce if within decision-cadence window
    const lastActionIso = lastActionDates[campaign] ?? null
    let cooldownActive = false
    let daysUntilNextReview: number | null = null
    if (lastActionIso && (category === 'Scale' || category === 'Reduce')) {
      const daysSince = Math.floor((Date.now() - new Date(lastActionIso).getTime()) / 86_400_000)
      const remaining = cadenceDays - daysSince
      if (remaining > 0) {
        cooldownActive = true
        daysUntilNextReview = remaining
        category = 'Monitor'
        reason = `Budget was last adjusted ${daysSince}d ago — next review in ${remaining} day${remaining !== 1 ? 's' : ''}.`
      }
    }

    const multiplier =
      category === 'Scale'
        ? 1 + reallocationPercentage / 100
        : category === 'Reduce'
          ? 1 - reallocationPercentage / 100
          : 1
    const recommendedSpend = latest.cost * multiplier

    const daysInPeriod = getDaysInPeriod(latest.period, mode)
    const avgDailySpend = latest.cost / daysInPeriod
    const recommendedDailySpend = recommendedSpend / daysInPeriod
    const dailySpendDelta = recommendedDailySpend - avgDailySpend

    results.push({
      campaign,
      latestPeriod: latest.period,
      latestSpend: latest.cost,
      latestRevenue: latest.revenue,
      latestRoas,
      historicalPeriods: historicalRows.length,
      historicalAvgSpend,
      historicalAvgRevenue,
      historicalAvgRoas,
      spendTrend,
      rroasTrend,
      incrementalSpend,
      incrementalRevenue,
      incrementalRoas,
      daysInPeriod,
      avgDailySpend,
      recommendedDailySpend,
      dailySpendDelta,
      lastActionDate: lastActionIso,
      cooldownActive,
      daysUntilNextReview,
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
              : 'Gather more data before acting',
      confidence,
    })
  })

  // Sort: Scale first, then Maintain, Reduce, Monitor; then alphabetically
  const order: Category[] = ['Scale', 'Maintain', 'Reduce', 'Monitor']
  return results.sort(
    (a, b) =>
      order.indexOf(a.category) - order.indexOf(b.category) ||
      a.campaign.localeCompare(b.campaign),
  )
}

export function computeMetrics(analyzedRows: AnalyzedRow[]) {
  const totalSpend = analyzedRows.reduce((s, r) => s + r.currentSpend, 0)
  const totalRevenue = analyzedRows.reduce((s, r) => s + r.currentRevenue, 0)
  const incrementalRows = analyzedRows.filter((r) => (r.incrementalSpend ?? 0) > 0)
  const totalIncrementalSpend = incrementalRows.reduce(
    (s, r) => s + (r.incrementalSpend ?? 0),
    0,
  )
  const totalIncrementalRevenue = incrementalRows.reduce(
    (s, r) => s + (r.incrementalRevenue ?? 0),
    0,
  )
  const counts = { Scale: 0, Maintain: 0, Reduce: 0, Monitor: 0 } as Record<Category, number>
  analyzedRows.forEach((r) => {
    counts[r.category] += 1
  })
  return {
    totalSpend,
    totalRevenue,
    averageRoas: totalSpend ? totalRevenue / totalSpend : null,
    totalIncrementalSpend,
    totalIncrementalRevenue,
    overallIncrementalRoas: totalIncrementalSpend
      ? totalIncrementalRevenue / totalIncrementalSpend
      : null,
    counts,
  }
}

// Compute consolidated-level metrics (from the latest period per campaign)
export function computeConsolidatedMetrics(rows: ConsolidatedRow[]) {
  const totalSpend = rows.reduce((s, r) => s + r.latestSpend, 0)
  const totalRevenue = rows.reduce((s, r) => s + r.latestRevenue, 0)
  const incrementalRows = rows.filter((r) => (r.incrementalSpend ?? 0) > 0)
  const totalIncrementalSpend = incrementalRows.reduce((s, r) => s + (r.incrementalSpend ?? 0), 0)
  const totalIncrementalRevenue = incrementalRows.reduce((s, r) => s + (r.incrementalRevenue ?? 0), 0)
  const counts = { Scale: 0, Maintain: 0, Reduce: 0, Monitor: 0 } as Record<Category, number>
  rows.forEach((r) => { counts[r.category] += 1 })
  return {
    totalSpend,
    totalRevenue,
    averageRoas: totalSpend ? totalRevenue / totalSpend : null,
    totalIncrementalSpend,
    totalIncrementalRevenue,
    overallIncrementalRoas: totalIncrementalSpend
      ? totalIncrementalRevenue / totalIncrementalSpend
      : null,
    counts,
  }
}
