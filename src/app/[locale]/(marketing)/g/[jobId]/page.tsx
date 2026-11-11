import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { notFound } from 'next/navigation'

import { cachedGalleryWork, galleryWorkView, isGalleryEnabled } from '@/core/gallery'
import { galleryImagePath } from '@/core/gallery/image'
import { WorkPage } from '@/core/gallery/ui'
import { localizePath } from '@/core/i18n'
import { currentLocale } from '@/core/i18n/server'
import { absoluteUrl, notIndexedRobots, pageMetadata } from '@/core/seo'
import { cachedWebCatalogue } from '@/core/templates/cached-catalogue'
import { site } from '@/site/site.config'

import { reportText } from './report-text'

// One public work (ARCHITECTURE §9, 创作库规格 U1–U5, U12): 200 and open to everyone while the
// gallery shows it, a real 404 otherwise (pending, rejected, private, deleted, closed gallery).
// Always noindex; canonical to itself; never in the sitemap. Cached reads only; the id is awaited
// above every boundary so each work gets its own cached page.

// Cache Components needs one entry; ids are only known at request time.
export function generateStaticParams() {
  return [{ jobId: '00000000-0000-4000-8000-000000000000' }]
}

async function load(params: Promise<{ jobId: string }>) {
  if (!(await isGalleryEnabled(site))) notFound()
  const [locale, { jobId }] = await Promise.all([currentLocale(), params])
  const [row, catalogue] = await Promise.all([cachedGalleryWork(jobId), cachedWebCatalogue(locale)])
  const work = row ? galleryWorkView(row, catalogue) : null
  if (!work) notFound()
  return { locale, work }
}

export async function generateMetadata({ params }: PageProps<'/[locale]/g/[jobId]'>): Promise<Metadata> {
  const { locale, work } = await load(params)
  const t = await getTranslations({ locale, namespace: 'gallery.work' })
  const base = pageMetadata(
    site,
    { path: `/g/${work.id}`, title: t('metaTitle', { template: work.templateName }), description: t('metaDescription', { template: work.templateName }) },
    locale,
  )
  const image = { url: absoluteUrl(site, galleryImagePath(work.id, 960)), alt: t('alt', { template: work.templateName }) }
  return { ...base, robots: notIndexedRobots(), openGraph: { ...base.openGraph, images: [image] }, twitter: { ...base.twitter, images: [image] } }
}

export default async function GalleryWorkRoute({ params }: PageProps<'/[locale]/g/[jobId]'>) {
  const { locale, work } = await load(params)
  const t = await getTranslations({ locale, namespace: 'gallery.work' })
  const text = {
    back: t('back'),
    template: t('template'),
    text: t('text'),
    reuse: t('reuse'),
    reuseNote: t('reuseNote'),
    watermark: t('watermark'),
    alt: t('alt', { template: work.templateName }),
  }
  return (
    <WorkPage work={work} text={text} report={await reportText(locale)} loginHref={`${localizePath('/login', locale)}?next=${encodeURIComponent(localizePath(`/g/${work.id}`, locale))}`} />
  )
}
