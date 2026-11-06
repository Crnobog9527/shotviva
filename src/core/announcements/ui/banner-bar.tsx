import type { HTMLAttributes, ReactNode } from 'react'

import { Link } from '../../i18n/ui'
import { cn } from '../../ui/cn'
import type { AnnouncementTone } from '../rules'

import './banner.css'

type Props = {
  message: string
  link: { url: string; label: string | null } | null
  tone: AnnouncementTone
  dismissLabel: string
  onDismiss?: () => void
} & Omit<HTMLAttributes<HTMLDivElement>, 'children'>

const stroke = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round' } as const

const ICONS: Record<AnnouncementTone, ReactNode> = {
  info: (
    <svg viewBox="0 0 24 24" aria-hidden {...stroke} strokeWidth={2}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5M12 8h.01" />
    </svg>
  ),
  promo: (
    <svg viewBox="0 0 24 24" aria-hidden {...stroke} strokeWidth={1.9}>
      <path d="M3.5 12.5V5a1.5 1.5 0 0 1 1.5-1.5h7.5l8 8-9 9z" />
      <circle cx="8" cy="8" r="1.4" />
    </svg>
  ),
}

// The banner's look (design/comps-v3-b `.ann`, T44), shared by the live banner and the admin
// preview: an icon, the message with its link as a pill, and the close button. One row that
// wraps instead of squeezing the header at 375px.
export function BannerBar({ message, link, tone, dismissLabel, onDismiss, className, ...rest }: Props) {
  return (
    <div {...rest} className={cn('sv-ann', tone === 'promo' && 'sv-promo', className)}>
      {ICONS[tone]}
      <p>
        {message}
        {link ? (
          <>
            {' '}
            <BannerLink url={link.url} label={link.label} name={message} />
          </>
        ) : null}
      </p>
      <button type="button" onClick={onDismiss} aria-label={dismissLabel} className="sv-ann-x">
        <svg viewBox="0 0 24 24" aria-hidden {...stroke} strokeWidth={2.2}>
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  )
}

const chevron = (
  <svg viewBox="0 0 24 24" aria-hidden {...stroke} strokeWidth={2.4}>
    <path d="M9 6l6 6-6 6" />
  </svg>
)

// A link with no label is just the chevron pill; it takes the message as its name.
function BannerLink({ url, label, name }: { url: string; label: string | null; name: string }) {
  const aria = label ? undefined : name
  const content = (
    <>
      {label ?? ''}
      {chevron}
    </>
  )
  return url.startsWith('/') ? (
    <Link href={url} className="sv-ann-pill" aria-label={aria}>
      {content}
    </Link>
  ) : (
    <a href={url} className="sv-ann-pill" rel="noopener" aria-label={aria}>
      {content}
    </a>
  )
}
