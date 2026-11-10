import { getTranslations } from 'next-intl/server'
import { currentLocale } from '@/core/i18n/server'
import { saveAction } from './actions'
import { formLabels } from './form-labels'
import { PartnerForm } from './interactive'
import type { Account, Settings } from './models'
import { PayoutFields } from './payout-fields'
import { publishedTerms } from './terms'
import { TermsConsent } from './terms-consent'

export async function SettingsForm({ account, settings }: { account: Account; settings: Settings }) {
  const [t, locale] = await Promise.all([getTranslations('affiliate'), currentLocale()])
  const accepted = account.terms_version === settings.terms_version && account.terms_accepted_at !== null
  const needsConsent = !accepted && Boolean(await publishedTerms(settings.terms_version))
  const readOnly = !accepted && !needsConsent
  const fields = (
    <>
      <PayoutFields account={account} t={t} disabled={readOnly} />
      {account.terms_version && account.terms_accepted_at && (
        <p className="af-hint">
          {t('accepted', {
            version: account.terms_version,
            date: new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(account.terms_accepted_at)),
          })}
        </p>
      )}
    </>
  )
  if (readOnly) return <section className="af-form"><h2>{t('payoutTitle')}</h2>{fields}<p className="af-note">{t('settingsReadOnly')}</p></section>
  return (
    <PartnerForm labels={formLabels(t, 'save')} action={saveAction}>
      <h2>{t('payoutTitle')}</h2>
      <p className="af-hint">{t('payoutIntro')}</p>
      {fields}
      {needsConsent && <TermsConsent t={t} version={settings.terms_version} />}
    </PartnerForm>
  )
}
