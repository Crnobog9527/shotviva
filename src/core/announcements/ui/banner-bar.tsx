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
  // No handler, no ✕: an announcement the admin set as not closable (ARCHITECTURE §10).
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

// A short message (a typical offer line, up to about two phone lines) is balanced on phones and,
// in Chinese, breaks only at punctuation and spaces, so 「40%。」 never ends up alone on a line.
// Longer ones keep normal breaking: breaking only at punctuation would leave ragged lines. Width
// counts a CJK character as two, as it renders, so the cut is the same in both languages.
const SHORT_MESSAGE_WIDTH = 64

function isShortMessage(message: string): boolean {
  let width = 0
  for (const char of message) width += (char.codePointAt(0) ?? 0) >= 0x2e80 ? 2 : 1
  return width <= SHORT_MESSAGE_WIDTH
}

// The banner's look (design/comps-v3-b `.ann`, T44), shared by the live banner and the admin
// preview: an icon, the message, its link as a pill, and the close button. The link sits beside
// the message on wider screens and on its own row under it on phones (banner.css).
export function BannerBar({ message, link, tone, dismissLabel, onDismiss, className, ...rest }: Props) {
  const short = isShortMessage(message)
  // A long message with a link puts the link on its own row at every width (banner.css).
  const classes = cn('sv-ann', tone === 'promo' && 'sv-promo', short && 'sv-ann-short', link && !short && 'sv-ann-stack', className)
  return (
    <div {...rest} className={classes}>
      {ICONS[tone]}
      <p>{message}</p>
      {link ? <BannerLink url={link.url} label={link.label} name={message} /> : null}
      {onDismiss ? (
        <button type="button" onClick={onDismiss} aria-label={dismissLabel} className="sv-ann-x">
          <svg viewBox="0 0 24 24" aria-hidden {...stroke} strokeWidth={2.2}>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      ) : null}
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
