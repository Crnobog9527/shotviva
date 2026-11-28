import { useLocale, useTranslations } from 'next-intl'

import type { OwnJobsFilter, OwnPhotoCategory } from '@/core/jobs'

import { FilterRail, type RailChip } from './filter-rail'

// Photos' filter on the personal page (作品页改版 PR③): All, each template category the person has
// finished works in, and the works that carry a watermark. One at a time, in the address.
export const photosHref = (filter: OwnJobsFilter | null, until?: string) => {
  const chosen: Record<string, string> = filter ? ('category' in filter ? { category: filter.category } : { mark: 'watermark' }) : {}
  const query = new URLSearchParams({ ...chosen, ...(until ? { until } : {}) }).toString()
  return query ? `/photos?${query}` : '/photos'
}

// A filter is worth showing once it can narrow something: two categories, or some watermarked
// works among clean ones. A chosen filter always shows it (the way back to All).
export function offersFilter(categories: readonly OwnPhotoCategory[], filter: OwnJobsFilter | null): boolean {
  if (filter) return true
  const total = categories.reduce((sum, c) => sum + c.works, 0)
  const marked = categories.reduce((sum, c) => sum + c.watermarked, 0)
  return categories.filter((c) => !c.system).length > 1 || (marked > 0 && marked < total)
}

// How many works a filter holds, by the chips' counts; null when they do not know the category.
export function heldBy(categories: readonly OwnPhotoCategory[], filter: OwnJobsFilter): number | null {
  if ('watermarked' in filter) return categories.reduce((sum, c) => sum + c.watermarked, 0)
  return categories.find((c) => c.key === filter.category)?.works ?? null
}

export function PhotoFilterRail({ categories, current }: { categories: readonly OwnPhotoCategory[]; current: OwnJobsFilter | null }) {
  const t = useTranslations('app.photos.filter')
  const zh = useLocale() === 'zh'
  const total = categories.reduce((sum, c) => sum + c.works, 0)
  const marked = categories.reduce((sum, c) => sum + c.watermarked, 0)
  const chosen = current && 'category' in current ? current.category : null
  const chips: RailChip[] = [
    { key: 'all', href: photosHref(null), label: t('all'), here: current === null, count: total },
    ...categories.filter((c) => !c.system).map((c) => ({
      key: `c-${c.key}`, href: photosHref({ category: c.key }), label: zh ? c.nameZh : c.nameEn, here: chosen === c.key, count: c.works,
    })),
    ...(marked > 0 ? [{ key: 'watermark', href: photosHref({ watermarked: true }), label: t('watermark'), here: current !== null && 'watermarked' in current, count: marked }] : []),
  ]
  return <FilterRail label={t('label')} chips={chips} />
}
