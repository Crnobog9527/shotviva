import { getTranslations } from 'next-intl/server'
import { unstable_rethrow } from 'next/navigation'

import { googleAction } from '@/app/auth/actions'
import { getSessionUser } from '@/core/auth'
import { logger } from '@/core/logger'
import type { Locale } from '@/core/i18n/locales'
import { cachedWebCatalogue } from '@/core/templates/cached-catalogue'
import { ShareCta } from '@/modules/image/marketing'
import { creditFacts, fillCredits, freeImagesIn } from '@/site/content'

type Props = { templateId: string; shareId: string | null; locale: Locale; text: Awaited<ReturnType<typeof shareCtaText>> }

export async function shareCtaText(locale: Locale) {
  const t = await getTranslations({ locale, namespace: 'share' })
  return { make: t('make'), browse: t('browse'), signUp: t('signUp'), signUpNote: t('signUpNote'), look: t('look') }
}

// "3 free Standard images", worked out exactly as the home page does.
async function giftOf(locale: Locale) {
  return fillCredits(freeImagesIn(locale), creditFacts(await cachedWebCatalogue(locale)))
}

// A shared link is often someone's first page: an auth hiccup shows the signed-out action, as
// the home page does, never an error page.
async function signedIn(): Promise<boolean> {
  try {
    return Boolean((await getSessionUser())?.verified)
  } catch (error) {
    unstable_rethrow(error)
    logger.error('share.viewer_read_failed', { error })
    return false
  }
}

// The visitor half of the share page, the only request-time read on it: who is looking.
export async function ShareCtaSlot({ templateId, shareId, locale, text }: Props) {
  const [viewer, gift] = await Promise.all([signedIn(), giftOf(locale)])
  return <ShareCta templateId={templateId} shareId={shareId} signedIn={viewer} googleAction={googleAction} gift={gift} text={text} />
}

// While the session streams in: the signed-out action, and no open event yet.
export async function ShareCtaFallback({ templateId, shareId, locale, text }: Props) {
  return <ShareCta templateId={templateId} shareId={shareId} signedIn={null} googleAction={googleAction} gift={await giftOf(locale)} text={text} />
}
