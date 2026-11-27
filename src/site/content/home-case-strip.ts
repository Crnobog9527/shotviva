import type { HeroStripBlock, HeroStripItem, ImageRef } from '@/core/content'
import type { Locale } from '@/core/i18n'
import type { LocalizedTemplate } from '@/core/templates'
import { CASE_STRIP_MAX, type PublicCaseEntry } from '@/core/templates/home-case-strip'

// 首页「更多真实案例」 (Owner 2026-11-25): the row under the first screen shows the admin's picks for
// this language (migration 2006), each pair being the template's own covers (phone photo =
// cover_before_url, result = cover_after_url) and its name as the caption; pressing a pair loads
// that template into the generator. A 精选组合 shows its first live template's pair under the
// bundle's name and picks that template, like the bundle card in 首页精选 does on its first frame.
// An entry that is not live (unpublished, no covers, a bundle with fewer than two live templates)
// drops out; with none left, or none set, the page keeps its built-in row.

type Live = Pick<LocalizedTemplate, 'id' | 'name' | 'description' | 'coverBeforeUrl' | 'coverAfterUrl'>
type Paired = Live & { coverBeforeUrl: string; coverAfterUrl: string }

// The plates are 4:5 and the covers are cropped to them (object-fit: cover, marketing.css); the
// stated size only names that shape for the srcset, as on the hero (home-hero-live.ts).
const plate = (src: string, alt: string): ImageRef => ({ src, alt, width: 880, height: 1100 })

const ALT: Record<Locale, { phone: (name: string) => string; ai: (name: string, use: string | null) => string }> = {
  en: {
    phone: (name) => `Real phone photo for the ${name} template`,
    ai: (name, use) => `Real example made with the ${name} template${use ? `: ${use}` : ''}`,
  },
  zh: {
    phone: (name) => `「${name}」模板的真实手机照`,
    ai: (name, use) => `用「${name}」模板做出的真实案例${use ? `：${use}` : ''}`,
  },
}

const paired = (template: Live | undefined): template is Paired => Boolean(template?.coverBeforeUrl && template.coverAfterUrl)

function pairOf(template: Paired, locale: Locale): Pick<HeroStripItem, 'before' | 'after' | 'pick'> {
  const alt = ALT[locale]
  return {
    before: plate(template.coverBeforeUrl, alt.phone(template.name)),
    after: plate(template.coverAfterUrl, alt.ai(template.name, template.description)),
    pick: template.id,
  }
}

function itemOf(entry: PublicCaseEntry, byId: ReadonlyMap<string, Live>, locale: Locale): HeroStripItem | null {
  if (entry.kind === 'template') {
    const template = byId.get(entry.id)
    return paired(template) ? { ...pairOf(template, locale), caption: template.name } : null
  }
  const members = entry.memberIds.flatMap((id) => byId.get(id) ?? [])
  const first = members.find(paired)
  if (members.length < 2 || !first) return null
  return { ...pairOf(first, locale), caption: entry.name, set: { count: members.length, showing: first.name } }
}

export function caseStripItems(entries: readonly PublicCaseEntry[], live: readonly Live[], locale: Locale): HeroStripItem[] {
  const byId = new Map(live.map((template) => [template.id, template]))
  return entries.flatMap((entry) => itemOf(entry, byId, locale) ?? []).slice(0, CASE_STRIP_MAX)
}

// A built-in pair opens the template its pictures were cut from while that template is live (a
// button, like the admin's picks); otherwise it stays a plain picture, never a dead button.
export function builtInItems(items: readonly HeroStripItem[], live: readonly Live[]): HeroStripItem[] {
  const ids = new Set(live.filter(paired).map((template) => template.id))
  return items.map(({ template, ...item }) => (template && ids.has(template) ? { ...item, pick: template } : item))
}

// The row the page shows: the admin's live entries under the built-in heading, else the built-in
// row itself. A hero option without a row of its own shows none either way.
export function homeCaseStrip(builtIn: HeroStripBlock | undefined, entries: readonly PublicCaseEntry[], live: readonly Live[], locale: Locale): HeroStripBlock | undefined {
  if (!builtIn) return undefined
  const items = caseStripItems(entries, live, locale)
  return items.length > 0 ? { heading: builtIn.heading, items } : { heading: builtIn.heading, items: builtInItems(builtIn.items, live) }
}
