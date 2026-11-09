import { getTranslations } from 'next-intl/server'
import { Link } from '@/core/i18n/ui'
import { currentLocale } from '@/core/i18n/server'
import type { Translate } from '@/core/translate'
import { applyAction, saveAction } from './actions'
import { PartnerForm } from './interactive'
import { payoutMethods, type Account, type Settings } from './models'

function labels(t: Translate, submit: string) {
  return { submit: t(submit), invalid: t('invalid'), failed: t('failed'), saved: t('saved') }
}
function Terms({ t, version, agreed }: { t: Translate; version: string; agreed?: boolean }) {
  return (
    <>
      <input type="hidden" name="termsVersion" value={version} />
      <label className="af-consent">
        <input name="accept" type="checkbox" required defaultChecked={agreed} />
        <span>
          {t('agree')} <Link href="/partners/terms">{t('termsLink', { version })}</Link>
        </span>
      </label>
    </>
  )
}

export async function ApplicationForm({
  parent,
  settings,
  eligible,
}: {
  parent: string
  settings: Settings
  eligible: boolean
}) {
  const t = await getTranslations('affiliate')
  if (!eligible)
    return (
      <section className="af-panel">
        <p>{t('needsPlan', { plan: t('tier.' + settings.apply_min_level) })}</p>
        <Link className="af-button" href="/pricing">
          {t('seePricing')}
        </Link>
      </section>
    )
  return (
    <PartnerForm labels={labels(t, 'submit')} action={applyAction}>
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
      <Terms t={t} version={settings.terms_version} />
    </PartnerForm>
  )
}

export async function SettingsForm({ account, settings }: { account: Account; settings: Settings }) {
  const [t, locale] = await Promise.all([getTranslations('affiliate'), currentLocale()])
  return (
    <PartnerForm labels={labels(t, 'save')} action={saveAction}>
      <label>
        {t('method')}
        <select name="method" defaultValue={account.payout_method ?? ''}>
          <option value="">{t('notSet')}</option>
          {payoutMethods.map((method) => (
            <option key={method} value={method}>
              {t('methods.' + method)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('details')}
        <textarea name="details" rows={3} maxLength={2000} defaultValue={account.payout_details ?? ''} />
      </label>
      <label>
        {t('us')}
        <select name="us" required defaultValue={taxChoice(account.us_person)}>
          <option value="" disabled>
            {t('select')}
          </option>
          <option value="yes">{t('yes')}</option>
          <option value="no">{t('no')}</option>
        </select>
      </label>
      {account.terms_version && account.terms_accepted_at && (
        <p>
          {t('accepted', {
            version: account.terms_version,
            date: new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(account.terms_accepted_at)),
          })}
        </p>
      )}
      <Terms t={t} version={settings.terms_version} agreed={account.terms_version === settings.terms_version} />
    </PartnerForm>
  )
}
function taxChoice(us: boolean | null) {
  if (us === null) return ''
  return us ? 'yes' : 'no'
}
