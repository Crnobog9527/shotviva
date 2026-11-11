import { getTranslations } from 'next-intl/server'

import { cachedGalleryPage, galleryWorkView } from '@/core/gallery'
import { GalleryPager, GalleryWall } from '@/core/gallery/ui'
import type { Locale } from '@/core/i18n'
import { cachedWebCatalogue } from '@/core/templates/cached-catalogue'

const pageOf = (raw: string | string[] | undefined) => {
  const page = typeof raw === 'string' && /^\d{1,2}$/.test(raw) ? Number(raw) : 1
  return page >= 1 ? page : 1
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>>; locale: Locale }

// One page of the wall: cached reads only (the page and the catalogue), so it costs no query
// per visit. Works whose template left the catalogue are skipped.
export async function GalleryWallPage({ searchParams, locale }: Props) {
  const page = pageOf((await searchParams).page)
  const [t, wall, catalogue] = await Promise.all([
    getTranslations({ locale, namespace: 'gallery' }),
    cachedGalleryPage(page),
    cachedWebCatalogue(locale),
  ])
  const tiles = wall.works.flatMap((row) => {
    const view = galleryWorkView(row, catalogue)
    return view ? [{ id: view.id, alt: t('tileAlt', { template: view.templateName }) }] : []
  })
  if (tiles.length === 0 && page === 1) return <p className="text-[var(--muted-foreground)]">{t('empty')}</p>
  return (
    <div className="grid gap-6">
      <GalleryWall tiles={tiles} label={t('heading')} />
      <GalleryPager
        page={page}
        hasNext={wall.hasNext}
        text={{ label: t('pager.label'), previous: t('pager.previous'), next: t('pager.next'), page: t('pager.page', { page }) }}
      />
    </div>
  )
}
