import { ChevronRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { cn } from '../../ui/cn'

type Props = { name: string; description: string; enabled: boolean; children: ReactNode }

// One external product in the account page's Integrations list (ARCHITECTURE §13). The row is a
// native <details>, so it opens with a tap or the keyboard without client JS: name and one line
// on the left, the status pill and a safelight chevron on the right; the product's own
// connect / disconnect block is the expanded content.
export function IntegrationRow({ name, description, enabled, children }: Props) {
  const t = useTranslations('partner.integrations')
  return (
    <details className="group">
      <summary className="grid min-h-16 cursor-pointer list-none grid-cols-[1fr_auto_auto] items-center gap-x-3 gap-y-1 py-3 focus-visible:rounded-[10px] focus-visible:outline-offset-[-2px] [&::-webkit-details-marker]:hidden">
        <b className="col-start-1 row-start-1 text-body leading-[1.3] font-semibold">{name}</b>
        <span
          data-status={enabled ? 'enabled' : 'not-enabled'}
          className={cn(
            'col-start-2 row-span-2 row-start-1 inline-flex h-7 items-center rounded-full px-2.5 text-caption leading-none font-semibold',
            enabled ? 'bg-success-tint text-success' : 'bg-wash text-muted-foreground',
          )}
        >
          {enabled ? t('enabled') : t('notEnabled')}
        </span>
        <ChevronRight aria-hidden strokeWidth={1.75} className="col-start-3 row-span-2 row-start-1 size-[18px] text-primary transition-transform duration-200 group-open:rotate-90 motion-reduce:transition-none" />
        <small className="col-start-1 row-start-2 text-caption leading-[1.35] text-muted-foreground">{description}</small>
      </summary>
      <div className="pb-4">{children}</div>
    </details>
  )
}
