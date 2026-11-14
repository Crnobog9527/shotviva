import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'

import { isGalleryEnabled } from '@/core/gallery'
import { Link } from '@/core/i18n/ui'
import { currentLocale } from '@/core/i18n/server'
import { pageMetadata } from '@/core/seo'
import { site } from '@/site/site.config'

import { GalleryWallPage } from './wall-page'

// The public gallery wall (ARCHITECTURE §9, 创作库规格 §1, U11). The switch is a cached read at
// the top, so while it is closed the prerendered page is a real 404, and opening it (its cache
// tags expire) rebuilds the page. The page number is request data and is read inside the
// Suspense boundary, so that rebuild never meets it; a number other than 1–20 never gets here:
// the proxy answers it with a real 404 first (core/gallery/page-number.ts).
export async function generateMetadata(): Promise<Metadata> {
  if (!(await isGalleryEnabled(site))) notFound()
  const locale = await currentLocale()
  const t = await getTranslations({ locale, namespace: 'gallery.meta' })
  return pageMetadata(site, { path: '/gallery', title: t('title'), description: t('description') }, locale)
}

export default async function GalleryRoute({ searchParams }: PageProps<'/[locale]/gallery'>) {
  if (!(await isGalleryEnabled(site))) notFound()
  const locale = await currentLocale()
  const t = await getTranslations({ locale, namespace: 'gallery' })
  return (
    <section className="mk-w grid gap-6 px-[var(--gutter)] py-8 md:py-12">
      <header className="grid max-w-2xl gap-3">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{t('heading')}</h1>
        <p className="text-[var(--muted-foreground)]">{t('intro')}</p>
      </header>
      <Suspense fallback={<div className="grid min-h-[60vh] grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4" />}>
        <GalleryWallPage searchParams={searchParams} locale={locale} />
      </Suspense>
      <Link href="/generate" className="mk-cta justify-self-center sm:w-auto sm:px-8">
        {t('cta')}
      </Link>
    </section>
  )
}
