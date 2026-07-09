type Props = {
  label: string
  value: string
  color?: string
  accent?: string
}

export function MetricCard({ label, value, color, accent }: Props) {
  return (
    <div
      className="bg-surface border border-border rounded-[22px] shadow-[0_16px_40px_rgba(100,116,139,0.12)] p-5 flex flex-col gap-2"
      style={accent ? { borderLeftWidth: 6, borderLeftColor: accent } : undefined}
    >
      <span className="text-muted font-bold text-sm">{label}</span>
      <strong
        className="text-[1.55rem] font-extrabold leading-tight"
        style={color ? { color } : undefined}
      >
        {value}
      </strong>
    </div>
  )
}
