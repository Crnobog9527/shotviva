// Line icons of the home generator (v3-b comp), 1.75 stroke, inherit the text colour.
const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

export const PlusIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" aria-hidden className={className} {...stroke}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)

export const ChevronIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden className="mk-chev" {...stroke}>
    <path d="M6 9l6 6 6-6" />
  </svg>
)

export const CameraIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden className="size-5" {...stroke}>
    <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H8l1.5-2h5L16 6h1.5A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" />
    <circle cx="12" cy="12.5" r="3.5" />
  </svg>
)

export const GiftIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" aria-hidden className={className} {...stroke}>
    <path d="M4 11h16v9H4zM3 7h18v4H3zM12 7v13M12 7S10.5 3 8 3.8C6 4.4 7 7 12 7zm0 0s1.5-4 4-3.2C18 4.4 17 7 12 7z" />
  </svg>
)

export const CheckIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden className="size-4" {...stroke} strokeWidth={2.4}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
)
