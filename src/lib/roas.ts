export type ViewMode = 'weekly' | 'monthly'
export type Category = 'Scale' | 'Maintain' | 'Reduce' | 'Monitor'

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

function periodTime(period: string, mode: ViewMode): number {
  if (mode === 'monthly')
    return Date.parse(period.length === 7 ? `${period}-01` : period) || 0
  return Date.parse(period.replace(/ - .*/, '')) || Date.parse(period) || 0
}

export function analyzeRows(
  rows: RawRow[],
  mode: ViewMode,
  targetIncrementalRoas: number,
  minimumSpend: number,
  reallocationPercentage: number,
): AnalyzedRow[] {
  const grouped = new Map<string, RawRow[]>()
  rows.forEach((row) =>
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
        ? previous.cost === 0
          ? null
          : previous.revenue / previous.cost
        : null
      const incrementalSpend = previous ? row.cost - previous.cost : null
      const incrementalRevenue = previous ? row.revenue - previous.revenue : null
      const incrementalRoas =
        incrementalSpend && incrementalSpend > 0
          ? (incrementalRevenue ?? 0) / incrementalSpend
          : null

      let category: Category = 'Monitor'
      let reason = 'First period or missing previous period data.'

      if (previous) {
        if ((incrementalSpend ?? 0) <= 0) {
          category = 'Monitor'
          reason = incrementalSpend === 0 ? 'No additional spend.' : 'Spend Reduced'
        } else if (row.cost < minimumSpend) {
          category = 'Monitor'
          reason = 'Below minimum spend threshold.'
        } else if ((incrementalRevenue ?? 0) <= 0) {
          category = 'Reduce'
          reason = 'Underperforming: revenue was flat or negative despite higher spend.'
        } else if ((incrementalRoas ?? 0) >= targetIncrementalRoas * 1.05) {
          category = 'Scale'
          reason = 'Incremental ROAS is above target.'
        } else if (
          (incrementalRoas ?? 0) >= targetIncrementalRoas * 0.85 ||
          Math.abs((currentRoas ?? 0) - (previousRoas ?? 0)) <=
            targetIncrementalRoas * 0.1
        ) {
          category = 'Maintain'
          reason = 'Incremental ROAS is close to target or current ROAS is stable.'
        } else {
          category = 'Reduce'
          reason = 'Incremental ROAS is below target.'
        }
      }

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
