import { getTranslations } from 'next-intl/server'
import { localized } from '@/core/i18n/server'
import { Link } from '@/core/i18n/ui'
import { ApplicationFields } from './application-fields'
import { formLabels } from './form-labels'
import { publishedTerms } from './terms'
import { TermsConsent } from './terms-consent'
import type { Settings } from './models'

export async function ApplicationForm({
  parent,
  settings,
  eligible,
  loginUrl,
}: {
  parent: string
  settings: Settings
  eligible: boolean
  loginUrl?: string
}) {
  const [t, successUrl, body] = await Promise.all([
    getTranslations('affiliate'), localized('/partners/join'), publishedTerms(settings.terms_version),
  ])
  const notice = !body && <p role="status">{t('applicationTermsPending')}</p>
  if (!eligible)
    return (
      <section className="af-panel">
        {!body && <p role="status">{t('termsPlaceholder')}</p>}
        <p>{t('needsPlan', { plan: t('tier.' + settings.apply_min_level) })}</p>
        <Link className="af-button" href="/pricing">
          {t('seePricing')}
        </Link>
      </section>
    )
  return (
    <ApplicationFields canSubmit={Boolean(body)} successUrl={successUrl} parent={parent} loginUrl={loginUrl} loginLabel={t('loginToSubmit')} labels={formLabels(t, 'submit')}>
      {notice}
      <input name="parent" type="hidden" value={parent} />
      <label>
        {t('name')}
        <input name="name" autoComplete="name" required maxLength={120} />
      </label>
      <label>
        {t('country')}
        <input name="country" autoComplete="country-name" required maxLength={100} />
      </label>
      <label>
        {t('channel')}
        <input name="channel" type="url" required maxLength={2048} />
      </label>
      <label>
        {t('audience')}
        <input name="audience" required maxLength={120} />
      </label>
      <label>
        {t('plan')}
        <textarea name="plan" rows={4} required maxLength={4000} />
      </label>
      {!loginUrl && body && <TermsConsent t={t} version={settings.terms_version} />}
    </ApplicationFields>
  )
}
