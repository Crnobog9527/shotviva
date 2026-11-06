import { Link } from '../../i18n/ui'
import type { HTMLAttributes } from 'react'

import { cn } from '../../ui/cn'
import type { AnnouncementTone } from '../rules'

type Props = {
  message: string
  link: { url: string; label: string | null } | null
  tone: AnnouncementTone
  dismissLabel: string
  onDismiss?: () => void
} & Omit<HTMLAttributes<HTMLDivElement>, 'children'>

// The banner's look, shared by the live banner and the admin preview. One slim row that wraps
// instead of squeezing the header at 375px; B tokens only.
export function BannerBar({ message, link, tone, dismissLabel, onDismiss, className, ...rest }: Props) {
  return (
    <div
      {...rest}
      className={cn(
        'flex w-full items-start gap-2 px-4 py-2 text-sm leading-snug [&[hidden]]:hidden',
        tone === 'promo' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
        className,
      )}
    >
      <p className="min-w-0 flex-1 text-center [overflow-wrap:anywhere]">
        {message}
        {link ? (
          <>
            {' '}
            <BannerLink url={link.url} label={link.label} />
          </>
        ) : null}
      </p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={dismissLabel}
        className="-my-1 -mr-2 flex size-8 shrink-0 items-center justify-center rounded-full opacity-80 hover:opacity-100"
      >
        <span aria-hidden>×</span>
      </button>
    </div>
  )
}

function BannerLink({ url, label }: { url: string; label: string | null }) {
  const text = label ?? '→'
  const className = 'font-semibold whitespace-nowrap underline underline-offset-2'
  return url.startsWith('/') ? (
    <Link href={url} className={className}>
      {text}
    </Link>
  ) : (
    <a href={url} className={className} rel="noopener">
      {text}
    </a>
  )
}
