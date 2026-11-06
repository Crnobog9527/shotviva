import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { Badge } from '../../ui/badge'

type Props = { name: string; description: string; enabled: boolean; children: ReactNode }

// One external product in the account page's Integrations list (ARCHITECTURE §13). The row is a
// native <details>, so it opens with a tap or the keyboard without client JS; the product's own
// connect / disconnect block is the expanded content.
export function IntegrationRow({ name, description, enabled, children }: Props) {
  const t = useTranslations('partner.integrations')
  return (
    <details className="group">
      <summary className="press flex min-h-11 cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
        <span className="grid min-w-0 flex-1 gap-1">
          <span className="flex flex-wrap items-center gap-2 text-headline leading-[1.25] font-semibold">
            {name}
            <StatusBadge enabled={enabled} label={enabled ? t('enabled') : t('notEnabled')} />
          </span>
          <span className="text-body text-bone-dim">{description}</span>
        </span>
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 shrink-0 text-primary transition-transform group-open:rotate-90" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 6l6 6-6 6" />
        </svg>
      </summary>
      <div className="pt-3">{children}</div>
    </details>
  )
}

function StatusBadge({ enabled, label }: { enabled: boolean; label: string }) {
  return enabled ? (
    <Badge data-status="enabled" className="bg-success-tint text-success">
      {label}
    </Badge>
  ) : (
    <Badge data-status="not-enabled" variant="outline" className="text-muted-foreground">
      {label}
    </Badge>
  )
}
