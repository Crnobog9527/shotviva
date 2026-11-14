import type { Counts } from './funnel'
import type { Touches } from './posthog'
import type { CohortPerson } from './reads'
import type { OwnTouches } from './first-touch'

// 「落地页」 and 「来源网站 / utm」 (ARCHITECTURE §16.6): sign-ups, first images and payments of the
// period's cohort by the page they first landed on and where they came from. The account's own
// first-touch row (sv_ft) wins; accounts without one (before it went live, no consent, another
// browser) fall back to PostHog's first page view and are labelled as inferred; the rest are
// 「没有记录」. No visitor column: visitors are not attributed per landing page here.

export const TOP_ROWS = 20
export type Basis = 'own' | 'posthog' | 'none'
export type TouchLine = { key: string; basis: Basis; counts: Counts }
export const NO_RECORD = ''
const DIRECT = '(direct)'

// A landing page without its query (campaign parameters have their own table); /zh kept.
export const landingKey = (path: string): string => path.split(/[?#]/)[0] || '/'

// utm_source / utm_medium when tagged, else the referring site, else direct.
export function sourceKeyOf(utm: string | null | undefined, medium: string | null | undefined, host: string | null | undefined): string {
  if (utm) return medium ? `utm: ${utm} / ${medium}` : `utm: ${utm}`
  const site = host && host !== '$direct' ? host.replace(/^www\./, '') : ''
  return site || DIRECT
}

type Keyed = { landing: string; source: string; basis: Basis }

export function touchOfPerson(id: string, own: OwnTouches | null, posthog: Touches | null): Keyed {
  const mine = own?.[id]
  if (mine) return { landing: landingKey(mine.landing), source: sourceKeyOf(mine.utmSource, mine.utmMedium, mine.refHost), basis: 'own' }
  const seen = posthog?.[id]
  if (seen?.landing) return { landing: landingKey(seen.landing), source: sourceKeyOf(seen.utm, seen.medium, seen.refHost), basis: 'posthog' }
  return { landing: NO_RECORD, source: NO_RECORD, basis: 'none' }
}

const DAY_MS = 86_400_000

function tally(lines: Map<string, TouchLine>, key: string, basis: Basis, person: CohortPerson) {
  const id = `${basis}\u0000${key}`
  const line = lines.get(id) ?? { key, basis, counts: { visitors: null, signups: 0, imaged: 0, imaged24h: 0, paid: 0 } }
  line.counts.signups += 1
  if (person.first_image_at) {
    line.counts.imaged += 1
    if (Date.parse(person.first_image_at) - Date.parse(person.signed_at) <= DAY_MS) line.counts.imaged24h += 1
  }
  if (person.first_paid_at) line.counts.paid += 1
  lines.set(id, line)
}

// The biggest groups by sign-ups first, at most TOP_ROWS; the rest are summed into one 「其他」 line.
function top(lines: Map<string, TouchLine>): TouchLine[] {
  const sorted = [...lines.values()].sort((a, b) => b.counts.signups - a.counts.signups || a.key.localeCompare(b.key))
  if (sorted.length <= TOP_ROWS) return sorted
  const rest = sorted.slice(TOP_ROWS - 1)
  const other: TouchLine = { key: 'other', basis: 'none', counts: { visitors: null, signups: 0, imaged: 0, imaged24h: 0, paid: 0 } }
  for (const line of rest) {
    other.counts.signups += line.counts.signups
    other.counts.imaged += line.counts.imaged
    other.counts.imaged24h += line.counts.imaged24h
    other.counts.paid += line.counts.paid
  }
  return [...sorted.slice(0, TOP_ROWS - 1), { ...other, key: '\u0000other' }]
}

export function touchBreakdown(people: readonly CohortPerson[], own: OwnTouches | null, posthog: Touches | null) {
  const byLanding = new Map<string, TouchLine>()
  const bySource = new Map<string, TouchLine>()
  const covered = { own: 0, posthog: 0, none: 0 }
  for (const person of people) {
    const touch = touchOfPerson(person.id, own, posthog)
    covered[touch.basis] += 1
    tally(byLanding, touch.landing, touch.basis, person)
    tally(bySource, touch.source, touch.basis, person)
  }
  return { byLanding: top(byLanding), bySource: top(bySource), covered }
}
