import 'server-only'

import { getTranslations } from 'next-intl/server'
import { cache } from 'react'

import { createAdminSupabase } from '@/core/auth'
import { localizePath } from '@/core/i18n'
import type { Locale } from '@/core/i18n/locales'
import { r2Store } from '@/core/storage'
import { cachedPosterTemplates, cachedWebTemplates } from '@/core/templates'
import { loadWorkShareView, type WorkShareView } from '@/core/work-share'
import type { SharedWorkItem } from '@/modules/image/work-share-page'

// Template names from the cached catalogues (posters are outside the web one, ARCHITECTURE §5.3);
// a template no longer listed still names its work with the generic word.
async function templateNames(locale: Locale): Promise<(id: string) => string> {
  const [web, posters, t] = await Promise.all([cachedWebTemplates(locale, true), cachedPosterTemplates(locale), getTranslations({ locale, namespace: 'app.photos' })])
  const names = new Map([...web, ...posters].map((template) => [template.id, template.name]))
  return (id) => names.get(id) ?? t('fallbackName')
}

// Read once per request: generateMetadata and the page both ask.
export const loadShare = cache(async (locale: Locale, shareId: string): Promise<WorkShareView | null> => {
  const templateName = await templateNames(locale)
  return loadWorkShareView({ db: createAdminSupabase(), store: r2Store, templateName }, shareId)
})

export async function shareItems(locale: Locale, view: WorkShareView): Promise<SharedWorkItem[]> {
  const t = await getTranslations({ locale, namespace: 'workShare' })
  return view.works.map((work) => ({
    jobId: work.jobId,
    afterUrl: work.afterUrl,
    beforeUrl: work.beforeUrl,
    alt: t('workAlt', { name: work.templateName }),
    caption: work.templateName,
    notes: [work.watermarked ? t('demo') : null, view.showBefore && !work.beforeUrl ? t('noBefore') : null].filter((note): note is string => note !== null),
  }))
}

// "Try Shotviva": the home page, with the sharer's affiliate code when they have one, so the
// proxy records the referral exactly as for their own link (core/affiliate/referral.ts).
export function ctaHref(locale: Locale, ref: string | null): string {
  const home = localizePath('/', locale)
  return ref ? `${home}?ref=${encodeURIComponent(ref)}` : home
}
