import type { TemplateCard, TemplateCategory, TemplateMedia } from '@/core/content'
import type { Locale } from '@/core/i18n'
import type { LocalizedTemplate } from '@/core/templates'
import type { PublicBundle } from '@/core/templates/cached-bundles'

import { bundleMore, placements } from './bundle-reach'

// 精选组合 on the home page (Owner 2026-11-25): each bundle is one card in its own group ahead of
// the category groups. The card cycles through its templates' before/after pairs like a series
// card, and a click picks the template on show; the bundle's template names are listed under it.
// A bundle with fewer than two live templates is not shown.

type Live = Pick<LocalizedTemplate, 'id' | 'name' | 'coverBeforeUrl' | 'coverAfterUrl'>

export const BUNDLE_MAX = 8
export const BUNDLE_KEY = (id: string) => `bundle-${id}`

// The intro names the whole catalogue's size, live (Owner 2026-11-25), so a card's few templates
// read as a pick from many.
export const BUNDLE_GROUP: Record<Locale, { name: string; intro(total: number): string }> = {
  en: { name: 'Featured sets', intro: (total) => `Hand-picked from all ${total} templates, a few at a time, shown together on one card. Choose the card to use the template on show, or pick any name below it.` },
  zh: { name: '精选组合', intro: (total) => `从全站 ${total} 个模板里挑出来的几组，在一张卡片里轮播展示。点击卡片即可使用当前显示的模板，也可以点下方名称直接选用。` },
}

// Where each card's last chip leads (bundle-reach.ts); null: the category index failed to read,
// so the chip offers every template.
type Index = Parameters<typeof placements>[0]

const live = (bundle: PublicBundle, byId: ReadonlyMap<string, Live>): Live[] => bundle.memberIds.flatMap((id) => byId.get(id) ?? [])
const hasCovers = (template: Live) => Boolean(template.coverBeforeUrl && template.coverAfterUrl)

// The members whose pairs the card cycles through, in bundle order.
export function pairedMembers(bundle: PublicBundle, byId: ReadonlyMap<string, Live>): Live[] {
  return live(bundle, byId).filter(hasCovers).slice(0, BUNDLE_MAX)
}

type Reach = { placed: ReturnType<typeof placements>; total: number; locale: Locale }

function toCard(bundle: PublicBundle, byId: ReadonlyMap<string, Live>, reach: Reach): TemplateCard | null {
  const members = live(bundle, byId)
  const paired = pairedMembers(bundle, byId)
  if (members.length < 2 || paired.length === 0) return null
  return {
    id: BUNDLE_KEY(bundle.id),
    name: bundle.name,
    use: '',
    bundle: {
      members: paired.map((member) => member.id),
      templates: members.map((member) => ({ id: member.id, name: member.name })),
      more: bundleMore(members.map((member) => member.id), reach.placed, reach.total, reach.locale),
    },
  }
}

export function bundleSection(catalogue: readonly Live[], bundles: readonly PublicBundle[], locale: Locale, index: Index | null = null) {
  const byId = new Map(catalogue.map((template) => [template.id, template]))
  const placed = index ? placements(index, new Set(byId.keys())) : new Map()
  const reach = { placed, total: catalogue.length, locale }
  const cards = bundles.flatMap((bundle) => toCard(bundle, byId, reach) ?? [])
  const media: Record<string, TemplateMedia> = Object.fromEntries(
    bundles.flatMap((bundle) => pairedMembers(bundle, byId)).map((template) => [template.id, { before: template.coverBeforeUrl, after: template.coverAfterUrl, live: true }]),
  )
  const [first, ...rest] = cards
  const group = BUNDLE_GROUP[locale]
  const category: TemplateCategory | null = first ? { name: group.name, intro: group.intro(catalogue.length), templates: [first, ...rest] } : null
  return { category, media }
}

// The later pairs of each bundle card, by card key, for /api/home/series, each with the template
// it shows, so the card picks by id whatever order a cached answer arrives in.
export function bundleLayerPairs(catalogue: readonly Live[], bundles: readonly PublicBundle[]): Record<string, [before: string, after: string, templateId: string][]> {
  const byId = new Map(catalogue.map((template) => [template.id, template]))
  return Object.fromEntries(bundles.flatMap((bundle) => {
    const later = pairedMembers(bundle, byId).slice(1)
    return later.length > 0 ? [[BUNDLE_KEY(bundle.id), later.map((member) => [member.coverBeforeUrl ?? '', member.coverAfterUrl ?? '', member.id] as [string, string, string])]] : []
  }))
}
