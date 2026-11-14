import { splitLocale } from '../../i18n/paths'

// What the visitor answered on the bar; null until they answer. Stored in localStorage under
// CONSENT_KEY and nothing else is stored there by us (T70).
export type ConsentChoice = 'accepted' | 'necessary'
export const CONSENT_KEY = 'sv_analytics_consent'

export type Consent = {
  // The proxy marked this visitor as outside the EU/EEA/UK/CH (region.ts).
  regionOpen: boolean
  choice: ConsentChoice | null
}

export type Persistence = 'localStorage+cookie' | 'memory'

export const parseChoice = (value: unknown): ConsentChoice | null => (value === 'accepted' || value === 'necessary' ? value : null)

// A choice wins over the region either way: "Necessary only" from a visitor outside Europe is
// honoured too (the footer's Cookie settings is open to everyone).
export function cookiesAllowed({ regionOpen, choice }: Consent): boolean {
  return choice ? choice === 'accepted' : regionOpen
}

export const persistenceFor = (consent: Consent): Persistence => (cookiesAllowed(consent) ? 'localStorage+cookie' : 'memory')

// The bar shows itself only to visitors who must be asked and have not answered.
export const barWanted = ({ regionOpen, choice }: Consent): boolean => !regionOpen && choice === null

// Session Replay is never forced on here: whether it records, and how much, is the PostHog
// project's setting (ARCHITECTURE §16.1). The client only keeps it off where it must stay off:
// without cookie consent, and on /admin and the checkout return page.
const NO_REPLAY = /^\/(admin|checkout)(\/|$)/

// Takes a path or a full URL (Next hands router transitions an href).
export function isReplayBlockedPath(href: string): boolean {
  const path = /^https?:/.test(href) ? new URL(href).pathname : href.split(/[?#]/)[0] || '/'
  return NO_REPLAY.test(splitLocale(path).path)
}

export const replayAllowed = (consent: Consent, pathname: string): boolean => cookiesAllowed(consent) && !isReplayBlockedPath(pathname)
