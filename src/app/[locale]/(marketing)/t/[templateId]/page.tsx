import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { connection } from 'next/server'
import { Suspense } from 'react'

import { isShareId, SHARE_PARAM } from '@/core/analytics/share-link'
import { currentLocale } from '@/core/i18n/server'
import { absoluteUrl, notIndexedRobots, pageMetadata } from '@/core/seo'
import { loadSharedTemplate, SharedTemplateMissing, SharedTemplatePage } from '@/modules/image/share-page'
import { site } from '@/site/site.config'

import { ShareCtaFallback, ShareCtaSlot, shareCtaText } from './share-cta-slot'

// A template's share page (Owner 2026-11-13): open to everyone, always noindex, canonical to
// itself without ?s=, never in the sitemap. The template comes from the cached catalogue; a
// template that is not live shows a short "not available" page with nothing of it.

export function generateStaticParams() {
  return [{ templateId: 'share' }]
}

// Per request: ids are only known then (as /g/[id]); the reads are cached.
export const instant = false

type Route = PageProps<'/[locale]/t/[templateId]'>

async function load({ params, searchParams }: Route) {
  await connection()
  const [locale, { templateId }, query] = await Promise.all([currentLocale(), params, searchParams])
  const shareId = query[SHARE_PARAM]
  return { locale, template: await loadSharedTemplate(locale, templateId), shareId: isShareId(shareId) ? shareId : null }
}

export async function generateMetadata(route: Route): Promise<Metadata> {
  const { locale, template } = await load(route)
  const t = await getTranslations({ locale, namespace: 'share' })
  const name = template?.name ?? t('missingTitle')
  const base = pageMetadata(site, { path: `/t/${(await route.params).templateId}`, title: t('metaTitle', { name }), description: template?.description ?? t('metaDescription', { name }) }, locale)
  const cover = template?.cover.after
  const images = cover ? [{ url: cover.startsWith('/') ? absoluteUrl(site, cover) : cover, alt: t('ogAlt', { name }) }] : []
  return { ...base, robots: notIndexedRobots(), openGraph: { ...base.openGraph, images }, twitter: { ...base.twitter, images } }
}

export default async function SharedTemplateRoute(route: Route) {
  const { locale, template, shareId } = await load(route)
  const t = await getTranslations({ locale, namespace: 'share' })
  if (!template) return <SharedTemplateMissing title={t('missingTitle')} text={t('missingText')} browse={t('missingBrowse')} />
  const text = { kicker: t('kicker', { category: template.categoryName }), hint: t('hint'), series: t('series', { name: template.series?.name ?? '', count: template.series?.members.length ?? 0 }) }
  const ctaText = await shareCtaText(locale)
  return (
    <SharedTemplatePage
      template={template}
      text={text}
      shareId={shareId}
      cta={
        <Suspense fallback={<ShareCtaFallback templateId={template.id} shareId={shareId} locale={locale} text={ctaText} />}>
          <ShareCtaSlot templateId={template.id} shareId={shareId} locale={locale} text={ctaText} />
        </Suspense>
      }
    />
  )
}
