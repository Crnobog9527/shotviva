import { getTranslations } from 'next-intl/server'

import type { ReportText } from '@/core/gallery/ui'
import type { Locale } from '@/core/i18n'
import { REPORT_REASONS } from '@/core/moderation/reasons'

// The report form's text, translated on the server (the gallery namespace never reaches the
// client bundle).
export async function reportText(locale: Locale): Promise<ReportText> {
  const t = await getTranslations({ locale, namespace: 'gallery.report' })
  const keys = ['open', 'title', 'body', 'reasonLabel', 'noteLabel', 'submit', 'cancel', 'close', 'sending', 'done', 'duplicate', 'limited', 'failed'] as const
  const reasons = Object.fromEntries(REPORT_REASONS.map((reason) => [reason, t(`reasons.${reason}`)])) as ReportText['reasons']
  return { ...(Object.fromEntries(keys.map((key) => [key, t(key)])) as Omit<ReportText, 'reasons'>), reasons }
}
