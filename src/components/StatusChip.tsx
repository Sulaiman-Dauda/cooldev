type ChipVariant = 'ready' | 'failed' | 'building' | 'neutral' | 'accent'

function inferVariant(label: string): ChipVariant {
  const s = label.toLowerCase()
  if (s === 'ready' || s === 'connected' || s === 'configured') return 'ready'
  if (s === 'key ready') return 'neutral'
  if (s === 'failed') return 'failed'
  if (s === 'building' || s === 'queued') return s === 'building' ? 'building' : 'neutral'
  if (s.includes('needs') || s === 'warning') return 'building'
  return 'neutral'
}

type StatusChipProps = {
  label: string
  variant?: ChipVariant
}

export function StatusChip({ label, variant }: StatusChipProps) {
  const v = variant ?? inferVariant(label)
  return <span className={`chip chip-${v}`}>{label}</span>
}
