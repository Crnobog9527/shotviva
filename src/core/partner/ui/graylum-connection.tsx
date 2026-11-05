import { useTranslations } from 'next-intl'

// Account page block (ARCHITECTURE §14.2): "Connected / Disconnect". Connecting itself always
// starts from Graylum, so the disconnected state has no button. The server action comes from app/.
export function GraylumConnection({ linkedAt, disconnect }: { linkedAt: Date | null; disconnect: () => Promise<void> }) {
  const t = useTranslations('partner.account')
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{t('title')}</h2>
      {linkedAt ? (
        <form action={disconnect} className="flex flex-col gap-3">
          <p className="text-sm">{t('connected', { date: linkedAt })}</p>
          <button type="submit" className="h-12 w-full rounded-md border border-neutral-300 text-base">
            {t('disconnect')}
          </button>
        </form>
      ) : (
        <p className="text-sm">{t('notConnected')}</p>
      )}
    </div>
  )
}
