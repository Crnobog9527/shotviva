import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { connection } from 'next/server'

import { currentLocale } from '@/core/i18n/server'
import { absoluteUrl, notIndexedRobots, pageMetadata } from '@/core/seo'
import { SharedCollectionCta, SharedCollectionMissing, SharedCollectionPage } from '@/modules/image/work-share-page'
import { site } from '@/site/site.config'

import { ctaHref, loadShare, shareItems } from './load'

// A shared work collection (ARCHITECTURE §6.2「作品集分享」, Owner 2026-11-22). Public on purpose:
// the unguessable link is the key. Always noindex, never in the sitemap, no canonical to any
// other page. Per request (a revoked link stops at once); images only through the share's own
// image route, so no storage address and no unmarked free work ever reaches the page.

export function generateStaticParams() {
  return [{ shareId: '0'.repeat(32) }]
}

export const instant = false

type Route = PageProps<'/[locale]/s/w/[shareId]'>

async function load(route: Route) {
  await connection()
  const [locale, { shareId }] = await Promise.all([currentLocale(), route.params])
  return { locale, shareId, view: await loadShare(locale, shareId) }
}

export async function generateMetadata(route: Route): Promise<Metadata> {
  const { locale, shareId, view } = await load(route)
  const t = await getTranslations({ locale, namespace: 'workShare' })
  const title = view ? t('metaTitle', { title: view.title ?? t('metaDefault') }) : t('missingTitle')
  const description = view ? t('metaDescription', { count: view.works.length }) : t('missingText')
  const base = pageMetadata(site, { path: `/s/w/${shareId}`, title, description }, locale)
  // The first result as the link preview; never an original photo.
  const first = view?.works[0]
  const images = first ? [{ url: absoluteUrl(site, first.afterUrl), alt: t('workAlt', { name: first.templateName }) }] : []
  return { ...base, robots: notIndexedRobots(), openGraph: { ...base.openGraph, images }, twitter: { ...base.twitter, images } }
}

export default async function SharedCollectionRoute(route: Route) {
  const { locale, view } = await load(route)
  const t = await getTranslations({ locale, namespace: 'workShare' })
  if (!view) return <SharedCollectionMissing title={t('missingTitle')} text={t('missingText')} home={t('cta')} />
  const items = await shareItems(locale, view)
  const text = {
    kicker: t('kicker', { count: items.length }),
    title: view.title ?? t('defaultTitle'),
    note: view.note,
    hint: items.some((item) => item.beforeUrl) ? t('compareHint') : t('afterOnlyHint'),
    emptyTitle: t('emptyTitle'),
    emptyText: t('emptyText'),
  }
  const cta = { title: t('ctaTitle'), text: t('ctaText'), action: t('cta') }
  return <SharedCollectionPage items={items} text={text} cta={<SharedCollectionCta href={ctaHref(locale, view.ref)} text={cta} />} />
}
