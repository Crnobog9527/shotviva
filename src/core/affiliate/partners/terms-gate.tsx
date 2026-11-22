import { getTranslations } from 'next-intl/server'
import { acceptTermsAction } from './actions'
import { formLabels } from './form-labels'
import { PartnerForm } from './interactive'
import { TermsConsent } from './terms-consent'

// Shown instead of every dashboard view while the affiliate has not accepted the current terms.
export async function TermsGate({ version }: { version: string }) {
  const t = await getTranslations('affiliate')
  return (
    <PartnerForm labels={formLabels(t, 'termsGateSubmit')} action={acceptTermsAction}>
      <h2>{t('termsGateTitle')}</h2>
      <p className="af-hint">{t('termsGateIntro', { version })}</p>
      <TermsConsent t={t} version={version} />
    </PartnerForm>
  )
}
