import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { connection } from 'next/server'
import { Suspense } from 'react'

import { googleAction } from '@/app/auth/actions'
import { currentLocale } from '@/core/i18n/server'
import { absoluteUrl, notIndexedRobots, pageMetadata } from '@/core/seo'
import { SharedTemplateMissing } from '@/modules/image/share-page'
import { CollectionViewer, CollectionViewerStatus, loadTemplateCollection, TemplateCollectionPage } from '@/modules/image/template-collection-page'
import { site } from '@/site/site.config'

import { giftOf, signedIn } from '../../../t/[templateId]/share-cta-slot'
import { collectionText, firstCover } from './collection-text'

// A template collection share page (ARCHITECTURE §5.1g, Owner 2026-11-22): open to anyone with
// the link, always noindex, never in the sitemap. An unknown or revoked link,
// or one whose templates have all gone offline, shows a short "not available" page.

export function generateStaticParams() {
  return [{ shareId: 'share' }]
}

// Per request: a link can be revoked at any moment; the catalogue read is cached.
export const instant = false

type Route = PageProps<'/[locale]/s/t/[shareId]'>

async function load({ params }: Route) {
  await connection()
  const [locale, { shareId }] = await Promise.all([currentLocale(), params])
  return { locale, shareId, collection: await loadTemplateCollection(locale, shareId) }
}

export async function generateMetadata(route: Route): Promise<Metadata> {
  const { locale, shareId, collection } = await load(route)
  const t = await getTranslations({ locale, namespace: 'templateShare' })
  const title = collection ? (collection.title ?? t('title')) : t('missingTitle')
  const base = pageMetadata(site, { path: `/s/t/${shareId}`, title: t('metaTitle', { title }), description: t('metaDescription') }, locale)
  // The link preview (chat apps) shows the first pick's public cover, as /t does.
  const cover = collection ? firstCover(collection) : null
  const images = cover ? [{ url: cover.startsWith('/') ? absoluteUrl(site, cover) : cover, alt: title }] : []
  return { ...base, robots: notIndexedRobots(), ...(cover ? { openGraph: { ...base.openGraph, images }, twitter: { ...base.twitter, images } } : {}) }
}

// The visitor's session, the page's only per-visitor read; streams in after the collection.
async function ViewerSlot() {
  return <CollectionViewerStatus signedIn={await signedIn()} />
}

export default async function TemplateCollectionRoute(route: Route) {
  const { locale, collection } = await load(route)
  const t = await getTranslations({ locale, namespace: 'templateShare' })
  if (!collection) return <SharedTemplateMissing title={t('missingTitle')} text={t('missingText')} browse={t('missingBrowse')} />
  return (
    <CollectionViewer googleAction={googleAction} gift={await giftOf(locale)}>
      <TemplateCollectionPage collection={collection} text={collectionText(t, collection)} viewer={<Suspense fallback={null}><ViewerSlot /></Suspense>} />
    </CollectionViewer>
  )
}
