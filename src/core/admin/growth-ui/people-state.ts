import type { People } from '../growth/people'
import type { PeopleBlock } from '../growth/load'
import { GROWTH_COPY as COPY } from './copy'

// Where PostHog's half of the overview stands while the database half is already on screen.
export type PeopleState = PeopleBlock | { status: 'loading' }

export const peopleData = (state: PeopleState): People | null => (state.status === 'ok' ? state.data : null)

export function missingText(state: PeopleState): string {
  if (state.status === 'loading') return COPY.funnel.loading
  return state.status === 'unconfigured' ? COPY.funnel.notConnected : COPY.funnel.missing
}
