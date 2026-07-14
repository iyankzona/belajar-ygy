export type ViewMode = 'weekly' | 'biweekly' | 'monthly'
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
  // power-curve regression iROAS (marginal ROAS at current spend)
  marginaliROAS: number | null       // derivative of fitted power curve at current spend
  rolling14iROAS: number | null      // iROAS over the trailing 2 periods (approx 14 days)
  rolling28iROAS: number | null      // iROAS over the trailing 4 periods (approx 28 days)
  regressionMethod: 'power-curve' | 'rolling-avg' | 'none'
  regressionPeriods: number          // how many periods were used in the regression
  regressionRSquared: number | null  // R² of the power-curve fit (0–1)
  regressionCoeffs: { a: number; b: number } | null  // power-curve params: revenue = a * spend^b
  // raw spend/revenue pairs for the chart — includes all historical + current period
  chartPoints: { spend: number; revenue: number; period: string; isCurrent: boolean }[]
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
  biweekly: ['Week', 'Campaign', 'Cost', 'Total conv. value', 'ROAS'], // same source format as weekly
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
  // biweekly labels look like "2025-01-06 – 2025-01-19"; parse the start date
  if (mode === 'biweekly') {
    const start = period.split(/\s*[–-]\s*/)[0].trim()
    return Date.parse(start) || 0
  }
  return Date.parse(period.replace(/ - .*/, '')) || Date.parse(period) || 0
}

/**
 * Returns the number of days in the given period string.
 * Weekly periods are always 7. Monthly periods are the actual days in that month.
 */
export function getDaysInPeriod(period: string, mode: ViewMode): number {
  if (mode === 'weekly') return 7
  if (mode === 'biweekly') return 14
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

/**
 * Aggregates weekly RawRows into biweekly periods.
 * Consecutive weekly periods are paired (oldest-first): week 1+2, week 3+4, etc.
 * Cost and revenue are summed within each pair.
 * If there is an odd number of weeks, the last lone week forms its own period.
 * The biweekly period label is the ISO date range of the two constituent weeks,
 * e.g. "2025-01-06 – 2025-01-19".
 */
export function aggregateBiweekly(weeklyRows: RawRow[]): RawRow[] {
  if (weeklyRows.length === 0) return []

  // Get sorted unique weeks
  const allWeeks = Array.from(new Set(weeklyRows.map((r) => r.period))).sort(
    (a, b) => periodTime(a, 'weekly') - periodTime(b, 'weekly'),
  )

  // Build week-pair → biweekly label map
  const weekToBiweekly = new Map<string, string>()
  for (let i = 0; i < allWeeks.length; i++) {
    const w1 = allWeeks[i]
    const w2 = allWeeks[i + 1] // may be undefined for an odd trailing week

    // Derive start/end dates for the label
    const startStr = w1.split(/\s*[-–]\s*/)[0].trim()
    const endCandidate = w2 ? w2.split(/\s*[-–]\s/).pop()?.trim() ?? w2 : w1.split(/\s*[-–]\s/).pop()?.trim() ?? w1
    const label = `${startStr} – ${endCandidate}`

    weekToBiweekly.set(w1, label)
    if (w2) {
      weekToBiweekly.set(w2, label)
      i++ // skip w2 in the outer loop
    }
  }

  // Aggregate rows by campaign + biweekly label
  const aggregated = new Map<string, RawRow>()
  for (const row of weeklyRows) {
    const bwPeriod = weekToBiweekly.get(row.period)
    if (!bwPeriod) continue
    const key = `${bwPeriod}|||${row.campaign}`
    const existing = aggregated.get(key)
    if (existing) {
      existing.cost += row.cost
      existing.revenue += row.revenue
    } else {
      aggregated.set(key, { period: bwPeriod, campaign: row.campaign, cost: row.cost, revenue: row.revenue })
    }
  }

  return Array.from(aggregated.values()).sort(
    (a, b) => periodTime(a.period, 'biweekly') - periodTime(b.period, 'biweekly'),
  )
}

// ─── Power-curve regression engine ──────────────────────────────────────────
// Fits log(revenue) ~ a + b*log(spend) via OLS on the trailing N periods.
// The derivative of the fitted curve revenue = exp(a) * spend^b at current spend
// is: dRevenue/dSpend = b * revenue / spend = b * ROAS.
// This is the marginal (incremental) ROAS at the current spend level.

export type RegressionResult = {
  marginalROAS: number | null
  rolling14: number | null   // iROAS over the 2 most-recent prior periods
  rolling28: number | null   // iROAS over the 4 most-recent prior periods
  method: 'power-curve' | 'rolling-avg' | 'none'
  periodsUsed: number
  elasticity: number | null  // b coefficient — the spend elasticity
  intercept: number | null   // OLS intercept in log space; a = exp(intercept)
  rSquared: number | null
}

export const MIN_REGRESSION_PERIODS = 6
export const MAX_REGRESSION_PERIODS = 12

/**
 * Computes simple OLS slope for y ~ a + b*x, returning { slope, intercept, r2 }.
 */
function ols(xs: number[], ys: number[]): { slope: number; intercept: number; r2: number } | null {
  const n = xs.length
  if (n < 2) return null
  const xMean = xs.reduce((s, v) => s + v, 0) / n
  const yMean = ys.reduce((s, v) => s + v, 0) / n
  let ssXX = 0, ssXY = 0, ssYY = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - xMean
    const dy = ys[i] - yMean
    ssXX += dx * dx
    ssXY += dx * dy
    ssYY += dy * dy
  }
  if (ssXX === 0) return null
  const slope = ssXY / ssXX
  const intercept = yMean - slope * xMean
  const r2 = ssYY === 0 ? 1 : (ssXY * ssXY) / (ssXX * ssYY)
  return { slope, intercept, r2 }
}

/**
 * Computes delta iROAS over a rolling window of `windowPeriods` prior periods.
 * Returns null if there is insufficient data.
 * windowPeriods=2 → trailing ~14 days (weekly), windowPeriods=4 → ~28 days.
 */
function rollingDeltaIROAS(historicalRows: RawRow[], current: RawRow, windowPeriods: number): number | null {
  if (historicalRows.length < windowPeriods) return null
  const window = historicalRows.slice(-windowPeriods)  // most recent N prior periods
  const baseSpend = window.reduce((s, r) => s + r.cost, 0) / window.length
  const baseRevenue = window.reduce((s, r) => s + r.revenue, 0) / window.length
  const deltaSpend = current.cost - baseSpend
  const deltaRevenue = current.revenue - baseRevenue
  if (deltaSpend <= 0) return null
  return deltaRevenue / deltaSpend
}

export function computeRegression(historicalRows: RawRow[], current: RawRow): RegressionResult {
  // Rolling window iROAS (always computed when possible)
  const rolling14 = rollingDeltaIROAS(historicalRows, current, 2)
  const rolling28 = rollingDeltaIROAS(historicalRows, current, 4)

  // Determine how many periods to use for regression (up to MAX, at least MIN)
  const allRows = [...historicalRows, current]
  const regressionPool = allRows.slice(-MAX_REGRESSION_PERIODS)
  const n = regressionPool.length

  if (n < MIN_REGRESSION_PERIODS) {
    const fallbackIROAS = rolling14 ?? rolling28 ?? null
    return {
      marginalROAS: fallbackIROAS, rolling14, rolling28,
      method: fallbackIROAS !== null ? 'rolling-avg' : 'none',
      periodsUsed: n, elasticity: null, intercept: null, rSquared: null,
    }
  }

  const valid = regressionPool.filter((r) => r.cost > 0 && r.revenue > 0)
  if (valid.length < MIN_REGRESSION_PERIODS) {
    const fallbackIROAS = rolling14 ?? rolling28 ?? null
    return {
      marginalROAS: fallbackIROAS, rolling14, rolling28,
      method: fallbackIROAS !== null ? 'rolling-avg' : 'none',
      periodsUsed: valid.length, elasticity: null, intercept: null, rSquared: null,
    }
  }

  const logSpend = valid.map((r) => Math.log(r.cost))
  const logRev   = valid.map((r) => Math.log(r.revenue))
  const fit = ols(logSpend, logRev)

  if (!fit) {
    const fallbackIROAS = rolling14 ?? rolling28 ?? null
    return {
      marginalROAS: fallbackIROAS, rolling14, rolling28,
      method: fallbackIROAS !== null ? 'rolling-avg' : 'none',
      periodsUsed: valid.length, elasticity: null, intercept: null, rSquared: null,
    }
  }

  const currentROAS = current.cost > 0 ? current.revenue / current.cost : null
  const marginalROAS = currentROAS !== null ? fit.slope * currentROAS : null

  return {
    marginalROAS, rolling14, rolling28,
    method: 'power-curve',
    periodsUsed: valid.length,
    elasticity: fit.slope,
    intercept: fit.intercept,
    rSquared: fit.r2,
  }
}

// Categorize a campaign.
// Prefers marginalIROAS (power-curve derivative) over the raw two-point delta.
function categorize(opts: {
  incrementalRoas: number | null       // two-point delta fallback
  marginalIROAS: number | null         // power-curve / rolling-avg estimate (preferred)
  regressionMethod: 'power-curve' | 'rolling-avg' | 'none'
  currentRoas: number | null
  previousRoas: number | null
  currentSpend: number
  minimumSpend: number
  targetIncrementalRoas: number
  hasHistory: boolean
}): { category: Category; reason: string } {
  const {
    incrementalRoas, marginalIROAS, regressionMethod,
    currentRoas, previousRoas, currentSpend, minimumSpend, targetIncrementalRoas, hasHistory,
  } = opts

  if (!hasHistory) {
    return { category: 'Monitor', reason: 'Only one period of data — no historical basis for comparison yet.' }
  }
  if (currentSpend < minimumSpend) {
    return { category: 'Monitor', reason: 'Spend is below the minimum threshold — insufficient volume for reliable signal.' }
  }

  // Use marginal iROAS from regression when available; fall back to two-point delta
  const effectiveIROAS = marginalIROAS ?? incrementalRoas
  const methodLabel =
    regressionMethod === 'power-curve'
      ? 'power-curve marginal iROAS'
      : regressionMethod === 'rolling-avg'
        ? 'rolling-average iROAS'
        : 'period-over-period delta'

  if (effectiveIROAS === null) {
    return { category: 'Monitor', reason: 'No incremental spend observed — unable to compute incremental ROAS.' }
  }
  if (effectiveIROAS <= 0) {
    return { category: 'Reduce', reason: `${methodLabel} is zero or negative — additional spend is generating no returns.` }
  }
  if (effectiveIROAS >= targetIncrementalRoas * 1.05) {
    return { category: 'Scale', reason: `${methodLabel} (${effectiveIROAS.toFixed(2)}x) comfortably exceeds target — campaign has strong marginal returns.` }
  }
  if (effectiveIROAS >= targetIncrementalRoas * 0.85) {
    return { category: 'Maintain', reason: `${methodLabel} (${effectiveIROAS.toFixed(2)}x) is close to target — campaign is performing at an efficient level.` }
  }
  if (
    currentRoas !== null &&
    previousRoas !== null &&
    Math.abs(currentRoas - previousRoas) <= targetIncrementalRoas * 0.1
  ) {
    return { category: 'Maintain', reason: `ROAS is stable period-over-period even though ${methodLabel} is slightly below target.` }
  }
  return { category: 'Reduce', reason: `${methodLabel} (${effectiveIROAS.toFixed(2)}x) is materially below target — efficiency is declining with more spend.` }
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

      // For analyzeRows (historical table), use simple delta — regression runs only in consolidateRows
      const { category, reason } = categorize({
        incrementalRoas,
        marginalIROAS: null,
        regressionMethod: 'none',
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

// Campaigns matching these patterns are always Monitor-only — no budget action ever generated.
const EXCLUDED_CAMPAIGN_PATTERNS = [/\bSBEC\b/i]

function isCampaignExcluded(name: string): boolean {
  return EXCLUDED_CAMPAIGN_PATTERNS.some((re) => re.test(name))
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

    // Campaigns excluded from budget-action logic (e.g. SBEC) are always Monitor-only.
    const excluded = isCampaignExcluded(campaign)

    // Find the row for the selected period. If a period is explicitly selected
    // and this campaign has no data for it, skip it — it was inactive that period.
    const latestIdx = selectedPeriod
      ? campaignRows.findLastIndex((r) => r.period === selectedPeriod)
      : -1

    // When a period is selected, only include campaigns that actually ran that period.
    if (selectedPeriod && latestIdx === -1) return

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

    // Power-curve regression (or rolling-avg fallback)
    const regression = computeRegression(historicalRows, latest)

    // Confidence: combine regression method, R², and period count
    // High:   power-curve AND R² >= 0.70
    // Medium: power-curve AND 0.40 <= R² < 0.70, or rolling-avg with 4+ periods
    // Low:    power-curve AND R² < 0.40, rolling-avg with <4 periods, or no signal
    const r2 = regression.rSquared
    const confidence: 'High' | 'Medium' | 'Low' =
      regression.method === 'power-curve' && r2 !== null && r2 >= 0.7
        ? 'High'
        : regression.method === 'power-curve' && r2 !== null && r2 >= 0.4
          ? 'Medium'
          : regression.method === 'power-curve' && (r2 === null || r2 < 0.4)
            ? 'Low'
            : historicalRows.length >= 4
              ? 'Medium'
              : 'Low'

    let { category, reason } = categorize({
      incrementalRoas,
      marginalIROAS: regression.marginalROAS,
      regressionMethod: regression.method,
      currentRoas: latestRoas,
      previousRoas: prevRoas,
      currentSpend: latest.cost,
      minimumSpend,
      targetIncrementalRoas,
      hasHistory: historicalRows.length > 0,
    })

    // ── SBEC / excluded campaigns: always Monitor, no budget action ──
    if (excluded && (category === 'Scale' || category === 'Reduce' || category === 'Maintain')) {
      category = 'Monitor'
      reason = 'Campaign is excluded from budget-action logic (SBEC) — monitor-only.'
    }

    // ── Confidence gating: Low confidence suppresses specific budget actions ──
    // Medium: keep Scale/Reduce pill but soften to half the reallocation %, flag in reason.
    // Low:    force Monitor regardless of what the curve says — the fit is too unreliable.
    const scaledReallocationPct =
      confidence === 'Medium' && (category === 'Scale' || category === 'Reduce')
        ? reallocationPercentage / 2
        : reallocationPercentage

    if (confidence === 'Low' && (category === 'Scale' || category === 'Reduce')) {
      const r2Label = r2 !== null ? ` (R² ${r2.toFixed(2)})` : ''
      category = 'Monitor'
      reason = `Insufficient regression reliability${r2Label} — curve fit too weak to act on. Gather more history before acting.`
    }

    // ── Cooldown: suppress Scale/Reduce if within decision-cadence window ──
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
        ? 1 + scaledReallocationPct / 100
        : category === 'Reduce'
          ? 1 - scaledReallocationPct / 100
          : 1
    const recommendedSpend = latest.cost * multiplier

    const daysInPeriod = getDaysInPeriod(latest.period, mode)
    const avgDailySpend = latest.cost / daysInPeriod
    const recommendedDailySpend = recommendedSpend / daysInPeriod
    const dailySpendDelta = recommendedDailySpend - avgDailySpend

    // Build recommendation string — reflect softened % for Medium, no figure for Monitor
    let recommendation: string
    if (category === 'Scale') {
      recommendation =
        confidence === 'Medium'
          ? `Scale (moderate confidence) — consider a smaller test increase of ${scaledReallocationPct}% to ${formatCurrency(recommendedSpend)}`
          : `Increase budget by ${scaledReallocationPct}% to ${formatCurrency(recommendedSpend)}`
    } else if (category === 'Reduce') {
      recommendation =
        confidence === 'Medium'
          ? `Reduce (moderate confidence) — consider a smaller decrease of ${scaledReallocationPct}% to ${formatCurrency(recommendedSpend)}`
          : `Decrease budget by ${scaledReallocationPct}% to ${formatCurrency(recommendedSpend)}`
    } else if (category === 'Maintain') {
      recommendation = 'Keep budget unchanged'
    } else {
      recommendation = excluded
        ? 'Excluded from budget action (SBEC) — monitor only'
        : 'Gather more data before acting'
    }

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
      marginaliROAS: regression.marginalROAS,
      rolling14iROAS: regression.rolling14,
      rolling28iROAS: regression.rolling28,
      regressionMethod: regression.method,
      regressionPeriods: regression.periodsUsed,
      regressionRSquared: regression.rSquared,
      regressionCoeffs:
        regression.method === 'power-curve' &&
        regression.elasticity !== null &&
        regression.intercept !== null
          ? { a: Math.exp(regression.intercept), b: regression.elasticity }
          : null,
      chartPoints: [...historicalRows, latest]
        .slice(-MAX_REGRESSION_PERIODS)
        .map((r) => ({
          spend: r.cost,
          revenue: r.revenue,
          period: r.period,
          isCurrent: r === latest,
        })),
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
      recommendation,
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
