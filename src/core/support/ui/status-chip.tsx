import { useTranslations } from 'next-intl'

import { cn } from '../../ui/cn'
import type { TicketStatus } from '../rules'

// Safelight marks only "Replied", the state that asks the user to look; the rest stay neutral.
const TONE: Record<TicketStatus, string> = {
  open: 'bg-wash text-muted-foreground',
  replied: 'bg-wash text-primary',
  closed: 'bg-wash text-muted-foreground',
}

export function StatusChip({ status }: { status: TicketStatus }) {
  const t = useTranslations('app.support.status')
  return (
    <span className={cn('inline-flex min-h-7 items-center rounded-full px-3 text-caption font-semibold', TONE[status])}>
      {t(status)}
    </span>
  )
}
