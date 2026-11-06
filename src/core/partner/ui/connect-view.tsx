import { useLocale, useTranslations } from 'next-intl'

import { isLocale } from '../../i18n/locales'
import { localizePath } from '../../i18n/paths'

// Bare on purpose: the app shell's look arrives with T8. One button, nothing else to decide.
export function ConnectView({ valid, state, returnTo }: { valid: boolean; state: string | null; returnTo: string | null }) {
  const t = useTranslations('partner.connect')
  const locale = useLocale()
  // Posts to the authorize route of the page's own language, so a lost-session detour goes
  // to the login page in that language (core/partner/connect-authorize.ts).
  const action = localizePath('/connect/graylum/authorize', isLocale(locale) ? locale : 'en')
  return (
    <section className="mx-auto flex w-full max-w-[720px] flex-col gap-6 px-4 py-8">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      {valid ? (
        <form action={action} method="post" className="flex flex-col gap-4">
          <p className="text-sm">{t('explain')}</p>
          <input type="hidden" name="state" value={state ?? ''} />
          {returnTo ? <input type="hidden" name="return_to" value={returnTo} /> : null}
          <button type="submit" className="h-12 w-full rounded-md bg-primary text-base font-semibold text-primary-foreground">
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
