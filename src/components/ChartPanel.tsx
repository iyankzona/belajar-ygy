'use client'

import { ResponsiveContainer } from 'recharts'

type Props = {
  title: string
  children: React.ReactElement
}

export function ChartPanel({ title, children }: Props) {
  return (
    <div className="bg-surface border border-border rounded-[22px] shadow-[0_16px_40px_rgba(100,116,139,0.12)] p-6 min-h-[400px]">
      <h2 className="text-base font-extrabold text-[#0f172a] mb-5">{title}</h2>
      <ResponsiveContainer width="100%" height={320}>
        {children}
      </ResponsiveContainer>
    </div>
  )
}
