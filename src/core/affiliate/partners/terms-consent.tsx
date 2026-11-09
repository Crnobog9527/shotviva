import type { Translate } from '@/core/translate'
import { Link } from '@/core/i18n/ui'

export function TermsConsent({ t, version }: { t: Translate; version: string }) {
  return (
    <>
      <input type="hidden" name="termsVersion" value={version} />
      <label className="af-consent">
        <input name="accept" type="checkbox" required />
        <span>
          {t('agree')} <Link href="/partners/terms" target="_blank" rel="noopener noreferrer">{t('termsLink', { version })}</Link>
        </span>
      </label>
    </>
  )
}
