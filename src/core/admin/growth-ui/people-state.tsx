import type { People } from '../growth/people'
import type { PeopleBlock } from '../growth/load'
import { GROWTH_COPY as COPY, POSTHOG_VERIFIED } from './copy'

// Where PostHog's half of the overview stands while the database half is already on screen.
export type PeopleState = PeopleBlock | { status: 'loading' }

export const peopleData = (state: PeopleState): People | null => (state.status === 'ok' ? state.data : null)

export function missingText(state: PeopleState): string {
  if (state.status === 'loading') return COPY.funnel.loading
  return state.status === 'unconfigured' ? COPY.funnel.notConnected : COPY.funnel.missing
}

// Marks a PostHog number until its query has been checked against PostHog (POSTHOG_VERIFIED).
export function Unverified() {
  if (POSTHOG_VERIFIED) return null
  return <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">{COPY.unverified}</span>
}
