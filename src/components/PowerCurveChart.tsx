'use client'

import {
  Chart as ChartJS,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  type ChartOptions,
  type ChartData,
} from 'chart.js'
import { Chart } from 'react-chartjs-2'
import { MIN_REGRESSION_PERIODS } from '@/lib/roas'

ChartJS.register(LinearScale, PointElement, LineElement, Tooltip, Legend)

// ─── IDR compact formatter ────────────────────────────────────────────────────
function fmtIDR(value: number): string {
  if (value >= 1_000_000_000) return `Rp ${(value / 1_000_000_000).toFixed(1)}B`
  if (value >= 1_000_000) return `Rp ${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `Rp ${(value / 1_000).toFixed(0)}K`
  return `Rp ${value.toFixed(0)}`
}

type Point = { spend: number; revenue: number; period: string; isCurrent: boolean }

type Props = {
  chartPoints: Point[]
  regressionCoeffs: { a: number; b: number } | null
  marginaliROAS: number | null
  regressionMethod: 'power-curve' | 'rolling-avg' | 'none'
  // The current cadence-period's aggregated spend and revenue.
  // For Weekly this matches the most-recent chartPoint; for Biweekly/Monthly
  // it is an aggregate that may sit further right than any individual weekly dot.
  currentPeriodSpend: number
  currentPeriodRevenue: number
}

export function PowerCurveChart({
  chartPoints,
  regressionCoeffs,
  marginaliROAS,
  regressionMethod,
  currentPeriodSpend,
  currentPeriodRevenue,
}: Props) {
  const hasCurve = regressionMethod === 'power-curve' && regressionCoeffs !== null && chartPoints.length >= MIN_REGRESSION_PERIODS

  // All chartPoints are weekly historical scatter — none carry isCurrent for Biweekly/Monthly,
  // so we never rely on the isCurrent flag for the current-period marker.
  // Instead we use the explicitly-passed currentPeriodSpend/Revenue.
  const hasCurrentPeriod = currentPeriodSpend > 0

  // ── Fitted curve — 60 smooth points across spend range ────────────────────
  // Include currentPeriodSpend in the range so the x-axis always fits it.
  const allSpends = [
    ...chartPoints.map((p) => p.spend).filter((s) => s > 0),
    ...(hasCurrentPeriod ? [currentPeriodSpend] : []),
  ]
  const minSpend = Math.min(...allSpends)
  const maxSpend = Math.max(...allSpends)
  const spendRange = maxSpend - minSpend || maxSpend * 0.2

  const curvePoints: { x: number; y: number }[] = []
  if (hasCurve && regressionCoeffs) {
    const { a, b } = regressionCoeffs
    const steps = 60
    // Extend the curve slightly past the rightmost point so the current marker
    // (which may be an aggregate and sit to the right of any weekly dot) is
    // never clipped by the curve ending too early.
    const curveMax = maxSpend + spendRange * 0.05
    const curveMin = minSpend
    const curveRange = curveMax - curveMin
    for (let i = 0; i <= steps; i++) {
      const s = curveMin + (curveRange * i) / steps
      curvePoints.push({ x: s, y: a * Math.pow(s, b) })
    }
  }

  // ── Tangent line segment anchored at the current cadence-period point ──────
  // Slope = marginaliROAS (already evaluated at currentPeriodSpend by evaluateCurveAtSpend).
  // We anchor the tangent at (currentPeriodSpend, currentPeriodRevenue) — actual observed
  // revenue — not the curve's prediction, so the marker shows real data.
  const tangentPoints: { x: number; y: number }[] = []
  if (hasCurve && hasCurrentPeriod && marginaliROAS !== null) {
    const cx = currentPeriodSpend
    const cy = currentPeriodRevenue
    const halfWidth = spendRange * 0.15   // short segment: ±15% of spend range
    tangentPoints.push({ x: cx - halfWidth, y: cy - marginaliROAS * halfWidth })
    tangentPoints.push({ x: cx + halfWidth, y: cy + marginaliROAS * halfWidth })
  }

  // ── CSS variable colours (resolved at runtime for dark-mode compat) ────────
  const cssVar = (name: string) =>
    typeof window !== 'undefined'
      ? getComputedStyle(document.documentElement).getPropertyValue(name).trim()
      : ''

  const colorMuted   = cssVar('--color-muted')   || '#6b7280'
  const colorText    = cssVar('--color-text')     || '#f1f5f9'
  const colorBorder  = cssVar('--color-border')   || '#1e293b'
  const colorSurface = cssVar('--color-surface-2') || '#1e293b'

  const BLUE   = '#3b82f6'
  const AMBER  = '#f59e0b'
  const GREEN  = '#22c55e'

  const data: ChartData<'scatter' | 'line'> = {
    datasets: [
      // 1. Historical weekly scatter points (all chartPoints — weekly grain regardless of view)
      {
        label: 'Historical (weekly)',
        data: chartPoints.map((p) => ({ x: p.spend, y: p.revenue })),
        backgroundColor: `${BLUE}99`,
        borderColor: BLUE,
        pointRadius: 5,
        pointHoverRadius: 7,
        showLine: false,
        order: 3,
      },
      // 2. Current cadence-period marker — uses aggregated spend/revenue for the current
      //    period (single week for Weekly; 2-week sum for Biweekly; monthly sum for Monthly).
      //    This is always plotted from the explicit props, never from isCurrent flags.
      ...(hasCurrentPeriod
        ? [{
            label: 'Current period',
            data: [{ x: currentPeriodSpend, y: currentPeriodRevenue }],
            backgroundColor: `${AMBER}cc`,
            borderColor: AMBER,
            pointRadius: 8,
            pointHoverRadius: 10,
            pointStyle: 'rectRot' as const,
            showLine: false,
            order: 1,
          }]
        : []),
      // 3. Fitted power curve — must use type:'line' so Chart.js actually draws the line
      ...(hasCurve
        ? [{
            type: 'line' as const,
            label: 'Power curve fit',
            data: curvePoints,
            borderColor: GREEN,
            backgroundColor: 'transparent',
            borderWidth: 2.5,
            pointRadius: 0,
            tension: 0,
            order: 4,
          }]
        : []),
      // 4. Tangent line at current spend — also needs type:'line'
      ...(tangentPoints.length === 2
        ? [{
            type: 'line' as const,
            label: `Marginal iROAS slope = ${marginaliROAS?.toFixed(2)}`,
            data: tangentPoints,
            borderColor: AMBER,
            backgroundColor: 'transparent',
            borderWidth: 2,
            borderDash: [5, 4],
            pointRadius: 0,
            order: 2,
          }]
        : []),
    ],
  }

  const options: ChartOptions<'scatter' | 'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 0 },
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          color: colorMuted,
          font: { size: 11 },
          boxWidth: 10,
          boxHeight: 10,
          padding: 10,
          usePointStyle: true,
        },
      },
      tooltip: {
        backgroundColor: '#1c1917',
        titleColor: colorText,
        bodyColor: colorMuted,
        borderColor: colorBorder,
        borderWidth: 1,
        padding: 10,
        callbacks: {
          label(ctx) {
            const raw = ctx.raw as { x: number; y: number }
            const pt = chartPoints.find((p) => Math.abs(p.spend - raw.x) < 1 && Math.abs(p.revenue - raw.y) < 1)
            const periodStr = pt ? ` · ${pt.period}` : ''
            return `Spend: ${fmtIDR(raw.x)}  Revenue: ${fmtIDR(raw.y)}${periodStr}`
          },
          title: () => '',
        },
      },
    },
    scales: {
      x: {
        type: 'linear',
        // Ensure the current-period marker is never clipped when it sits right of
        // all weekly scatter points (Biweekly / Monthly aggregates).
        min: minSpend - spendRange * 0.05,
        max: maxSpend + spendRange * 0.1,
        title: {
          display: true,
          text: 'Spend',
          color: colorMuted,
          font: { size: 11 },
        },
        ticks: {
          color: colorMuted,
          font: { size: 10 },
          maxTicksLimit: 6,
          callback: (v) => fmtIDR(Number(v)),
        },
        grid: { color: `${colorBorder}66` },
      },
      y: {
        type: 'linear',
        title: {
          display: true,
          text: 'Revenue',
          color: colorMuted,
          font: { size: 11 },
        },
        ticks: {
          color: colorMuted,
          font: { size: 10 },
          maxTicksLimit: 6,
          callback: (v) => fmtIDR(Number(v)),
        },
        grid: { color: `${colorBorder}66` },
      },
    },
  }

  return (
    <div>
      {/* No-curve notice */}
      {!hasCurve && (
        <p className="text-[11px] text-muted mb-2 italic">
          {chartPoints.length < MIN_REGRESSION_PERIODS
            ? `Not enough history for curve fit — need ${MIN_REGRESSION_PERIODS} periods, have ${chartPoints.length}.`
            : 'Curve fit unavailable — showing historical points only.'}
        </p>
      )}
      <div style={{ height: 270 }}>
        <Chart type="scatter" data={data} options={options} />
      </div>
    </div>
  )
}
