import { useTranslations } from 'next-intl'

import { buttonVariants } from '../../ui/button'

// Graylum's expanded row in Integrations (ARCHITECTURE §14.2): "Connected since … / Disconnect".
// Connecting itself always starts from Graylum, so the disconnected state has no button. The
// server action comes from app/.
export function GraylumConnection({ linkedAt, disconnect }: { linkedAt: Date | null; disconnect: () => Promise<void> }) {
  const t = useTranslations('partner.account')
  if (!linkedAt) return <p className="text-caption text-muted-foreground">{t('notConnected')}</p>
  return (
    <form action={disconnect} className="flex flex-col gap-3">
      <p className="text-caption text-bone-dim">{t('connected', { date: linkedAt })}</p>
      <button type="submit" className={buttonVariants({ variant: 'glass', size: 'touch', className: 'w-full' })}>
        {t('disconnect')}
      </button>
    </form>
  )
}
