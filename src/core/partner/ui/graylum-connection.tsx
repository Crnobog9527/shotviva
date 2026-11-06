import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

// Graylum's expanded row in Integrations (ARCHITECTURE §14.2): "Connected since … / Disconnect".
// Connecting itself always starts from Graylum, so the disconnected state has no button. The
// server action comes from app/.
export function GraylumConnection({ linkedAt, disconnect }: { linkedAt: Date | null; disconnect: () => Promise<void> }) {
  const t = useTranslations('partner.account')
  if (!linkedAt) return <p className="text-caption text-muted-foreground">{t('notConnected')}</p>
  const b = (chunks: ReactNode) => <b className="font-medium text-foreground">{chunks}</b>
  return (
    <form action={disconnect} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <p className="text-caption text-muted-foreground">{t.rich('connected', { b, date: linkedAt })}</p>
      <button
        type="submit"
        className="press relative inline-flex h-9 items-center rounded-full bg-wash px-4 text-caption font-semibold whitespace-nowrap shadow-[inset_0_0_0_1px_var(--border)] before:absolute before:-inset-x-0.5 before:-inset-y-1"
      >
        {t('disconnect')}
      </button>
    </form>
  )
}
