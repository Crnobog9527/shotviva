import { getTranslations } from 'next-intl/server'
import { loginPath, type SessionUser } from '@/core/auth'
import { currentLocale, localized } from '@/core/i18n/server'
import { Link } from '@/core/i18n/ui'
import { applyPath } from './application-entry'
import { ApplicationFields } from './application-fields'
import { audienceRanges, channelOrder, countryOptions } from './application-options'
import { formLabels } from './form-labels'
import type { EnrollmentSettings } from './models'
import { canApply } from './repository'
import { publishedTerms } from './terms'
import { TermsConsent } from './terms-consent'

type Props = { session: SessionUser | null; parent: string; settings: EnrollmentSettings }

// The application: one page, one account. A visitor without a verified account is sent to
// create or verify it first; the form never shows to them.
export async function ApplicationPage({ session, parent, settings }: Props) {
  const t = await getTranslations('affiliate')
  return (
    <div className="af-apply">
      <header className="af-apply-head">
        <Link href="/partners/join" className="af-back">{t('backToProgram')}</Link>
        <h1>{t('applyTitle')}</h1>
        <p className="af-lede">{t('applyLede')}</p>
      </header>
      {session?.verified ? <ApplicationForm session={session} parent={parent} settings={settings} /> : <AccountFirst session={session} parent={parent} />}
    </div>
  )
}

async function AccountFirst({ session, parent }: { session: SessionUser | null; parent: string }) {
  const [t, next] = await Promise.all([getTranslations('affiliate'), localized(applyPath(parent))])
  if (session) {
    return (
      <section className="af-panel af-gate" role="status">
        <h2>{t('verifyTitle')}</h2>
        <p>{t('verifyBody')}</p>
      </section>
    )
  }
  return (
    <section className="af-panel af-gate">
      <h2>{t('accountFirstTitle')}</h2>
      <p>{t('accountFirstBody')}</p>
      <Link href={'/signup?next=' + encodeURIComponent(next)} className="af-button">{t('signupToApply')}</Link>
      <p className="af-cta-note">
        {t('haveAccount')} <Link href={loginPath(next)} className="af-link">{t('loginToApply')}</Link>
      </p>
    </section>
  )
}

export async function ApplicationForm({ session, parent, settings }: { session: SessionUser; parent: string; settings: EnrollmentSettings }) {
  const [t, locale, eligible, successUrl, body] = await Promise.all([
    getTranslations('affiliate'),
    currentLocale(),
    settings.apply_min_level === 'none' ? true : canApply(session.id),
    localized('/partners/join'),
    publishedTerms(settings.terms_version),
  ])
  if (!eligible) {
    return (
      <section className="af-panel af-gate">
        <h2>{t('needsPlanTitle')}</h2>
        <p>{t('needsPlan', { plan: t('tier.' + settings.apply_min_level) })}</p>
        <Link className="af-button" href="/pricing">{t('seePricing')}</Link>
      </section>
    )
  }
  const optional = <span className="af-optional"> {t('optional')}</span>
  return (
    <ApplicationFields canSubmit={Boolean(body)} successUrl={successUrl} labels={formLabels(t, 'submit')}>
      <div className="af-account" aria-label={t('applyingAs')}>
        <span className="af-account-label">{t('applyingAs')}</span>
        <span className="af-account-id">{session.email ?? (session.phone ? '+' + session.phone : session.id)}</span>
      </div>
      {!body && <p className="af-note" role="status">{t('applicationTermsPending')}</p>}
      <input name="parent" type="hidden" value={parent} />

      <fieldset>
        <legend>{t('aboutYou')}</legend>
        <label>
          <span>{t('name')}</span>
          <input name="name" autoComplete="name" required maxLength={120} />
          <small>{t('nameHint')}</small>
        </label>
        <label>
          <span>{t('country')}</span>
          <select name="country" required defaultValue="">
            <option value="" disabled>{t('select')}</option>
            {countryOptions(locale).map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
        </label>
      </fieldset>

      <fieldset>
        <legend>{t('whereYouShare')}</legend>
        <label>
          <span>{t('channelType')}</span>
          <select name="channel_type" required defaultValue="">
            <option value="" disabled>{t('select')}</option>
            {channelOrder(locale).map((key) => <option key={key} value={key}>{t('channelTypes.' + key)}</option>)}
          </select>
        </label>
        <label>
          <span>{t('channel')}</span>
          <input name="channel" required maxLength={2048} autoCapitalize="off" spellCheck={false} placeholder={t('channelPlaceholder')} />
          <small>{t('channelHint')}</small>
        </label>
        <label>
          <span>{t('audience')}</span>
          <select name="audience" required defaultValue="">
            <option value="" disabled>{t('select')}</option>
            {audienceRanges.map((key) => <option key={key} value={key}>{t('audienceRanges.' + key)}</option>)}
          </select>
        </label>
        <label>
          <span>{t('otherChannels')}{optional}</span>
          <textarea name="other_channels" rows={3} maxLength={2000} placeholder={t('otherChannelsPlaceholder')} />
        </label>
      </fieldset>

      <fieldset>
        <legend>{t('yourPlan')}</legend>
        <label>
          <span>{t('plan')}</span>
          <textarea name="plan" rows={4} required maxLength={2000} placeholder={t('planPlaceholder')} />
        </label>
        <label>
          <span>{t('contact')}{optional}</span>
          <input name="contact" maxLength={200} autoCapitalize="off" spellCheck={false} placeholder={t('contactPlaceholder')} />
          <small>{t('contactHint')}</small>
        </label>
      </fieldset>

      {body && <TermsConsent t={t} version={settings.terms_version} />}
    </ApplicationFields>
  )
}
