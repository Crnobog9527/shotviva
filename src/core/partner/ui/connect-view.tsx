import { useTranslations } from 'next-intl'

// Bare on purpose: the app shell's look arrives with T8. One button, nothing else to decide.
export function ConnectView({ valid, state, returnTo }: { valid: boolean; state: string | null; returnTo: string | null }) {
  const t = useTranslations('partner.connect')
  return (
    <section className="mx-auto flex w-full max-w-[720px] flex-col gap-6 px-4 py-8">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      {valid ? (
        <form action="/connect/graylum/authorize" method="post" className="flex flex-col gap-4">
          <p className="text-sm">{t('explain')}</p>
          <input type="hidden" name="state" value={state ?? ''} />
          {returnTo ? <input type="hidden" name="return_to" value={returnTo} /> : null}
          <button type="submit" className="h-12 w-full rounded-md bg-neutral-900 text-base font-medium text-white">
            {t('allow')}
          </button>
        </form>
      ) : (
        <p role="alert" className="text-sm">
          {t('invalid')}
        </p>
      )}
    </section>
  )
}
