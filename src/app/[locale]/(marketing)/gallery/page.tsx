import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { notFound } from 'next/navigation'

import { GALLERY_MAX_PAGES, isGalleryEnabled } from '@/core/gallery'
import { Link } from '@/core/i18n/ui'
import { currentLocale } from '@/core/i18n/server'
import { pageMetadata } from '@/core/seo'
import { site } from '@/site/site.config'

import { GalleryWallPage } from './wall-page'

// The public gallery wall (ARCHITECTURE §9, 创作库规格 §1, U11). A real 404 while the admin
// switch is closed, and for any page number other than 1–20 (?page=1 is just /gallery). The page
// renders per request from cached reads only.

function pageOf(raw: string | string[] | undefined): number | null {
  if (raw === undefined) return 1
  if (typeof raw !== 'string' || !/^[1-9]\d?$/.test(raw)) return null
  const page = Number(raw)
  return page <= GALLERY_MAX_PAGES ? page : null
}
export async function generateMetadata(): Promise<Metadata> {
  if (!(await isGalleryEnabled(site))) notFound()
  const locale = await currentLocale()
  const t = await getTranslations({ locale, namespace: 'gallery.meta' })
  return pageMetadata(site, { path: '/gallery', title: t('title'), description: t('description') }, locale)
}

export default async function GalleryRoute({ searchParams }: PageProps<'/[locale]/gallery'>) {
  if (!(await isGalleryEnabled(site))) notFound()
  const page = pageOf((await searchParams).page)
  if (page === null) notFound()
  const locale = await currentLocale()
  const t = await getTranslations({ locale, namespace: 'gallery' })
  return (
    <section className="mk-w grid gap-6 px-[var(--gutter)] py-8 md:py-12">
      <header className="grid max-w-2xl gap-3">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{t('heading')}</h1>
        <p className="text-[var(--muted-foreground)]">{t('intro')}</p>
      </header>
      <GalleryWallPage page={page} locale={locale} />
      <Link href="/generate" className="mk-cta justify-self-center sm:w-auto sm:px-8">
        {t('cta')}
      </Link>
    </section>
  )
}
