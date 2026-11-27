import type { PvuvState } from '../analytics/pvuv-load'
import type { PvuvOverview } from '../analytics/pvuv-read'
import type { People } from '../growth/people'
import type { PeopleBlock } from '../growth/load'
import { GROWTH_COPY as COPY } from './copy'

// Where PostHog's half of the overview stands while the database half is already on screen.
export type PeopleState = PeopleBlock | { status: 'loading' }

// PVUV.ai's overview while PostHog is off; null while PostHog is in use (PVUV is then not read).
export type PvuvOverviewState = PvuvState<PvuvOverview> | { status: 'loading' }

export const peopleData = (state: PeopleState): People | null => (state.status === 'ok' ? state.data : null)

// Visitors for the headline and the funnel: PostHog's while it is read, else PVUV's humans (uv).
export type Visitors = { current: number; previous: number | null; from: 'posthog' | 'pvuv' }

export function visitorsOf(people: PeopleState, pvuv: PvuvOverviewState | null): Visitors | null {
  const seen = peopleData(people)
  if (seen) return { current: seen.current.visitors, previous: seen.previous.visitors, from: 'posthog' }
  if (pvuv?.status === 'ok') return { current: pvuv.data.current.uv, previous: pvuv.data.previous?.uv ?? null, from: 'pvuv' }
  return null
}

// PostHog is not read and PVUV stands in for it: the steps only PostHog had move to 「漏斗」.
export const pvuvInUse = (people: PeopleState, pvuv: PvuvOverviewState | null): boolean => pvuv !== null && people.status === 'unconfigured'

export function missingText(state: PeopleState): string {
  if (state.status === 'loading') return COPY.funnel.loading
  return state.status === 'unconfigured' ? COPY.funnel.notConnected : COPY.funnel.missing
}

// Why there is no visitor number, when PVUV is the source.
export function visitorsMissingText(people: PeopleState, pvuv: PvuvOverviewState | null): string {
  if (!pvuv || !pvuvInUse(people, pvuv)) return missingText(people)
  if (pvuv.status === 'loading') return COPY.funnel.pvuvLoading
  return pvuv.status === 'unconfigured' ? COPY.funnel.pvuvNotConnected : COPY.funnel.pvuvMissing
}
