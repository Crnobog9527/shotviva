// The wishlist's line glyphs (B comp wishlist.html), drawn with currentColor.
type IconProps = { className?: string }

const stroke = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round' } as const

export function HeartIcon({ className = 'size-[17px] md:size-[18px]' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} {...stroke} strokeWidth={1.75}>
      <path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20z" />
    </svg>
  )
}

export function ChevronIcon({ className = 'size-4 flex-none' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} {...stroke} strokeWidth={2}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  )
}

export function StackIcon({ className = 'size-[11px]' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} {...stroke} strokeWidth={2.2}>
      <rect x="3.5" y="5.5" width="14" height="14" rx="3" />
      <path d="M7 3.5h10.5a3 3 0 0 1 3 3V17" />
    </svg>
  )
}

export function CheckIcon({ className = 'size-[18px] flex-none text-bone-dim' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} {...stroke} strokeWidth={1.75}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  )
}

export function CloseIcon({ className = 'size-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} {...stroke} strokeWidth={2.2}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}
