import { useTranslations } from 'next-intl'

import { buttonVariants } from '../../ui/button'

// Account page block (ARCHITECTURE §14.2): "Connected / Disconnect". Connecting itself always
// starts from Graylum, so the disconnected state has no button. The server action comes from app/.
export function GraylumConnection({ linkedAt, disconnect }: { linkedAt: Date | null; disconnect: () => Promise<void> }) {
  const t = useTranslations('partner.account')
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-headline leading-[1.25] font-semibold">{t('title')}</h2>
      {linkedAt ? (
        <form action={disconnect} className="flex flex-col gap-3">
          <p className="text-caption text-bone-dim">{t('connected', { date: linkedAt })}</p>
          <button type="submit" className={buttonVariants({ variant: 'glass', size: 'touch', className: 'w-full' })}>
            {t('disconnect')}
          </button>
        </form>
      ) : (
        <p className="text-caption text-muted-foreground">{t('notConnected')}</p>
      )}
    </div>
  )
}
