// Who is asked before analytics may use cookies (ARCHITECTURE §16.1, T70): the EU, the rest of
// the EEA, the UK and Switzerland. Everyone else is recorded with cookies and sees no bar.
// ISO 3166-1 alpha-2, as Vercel sends them in x-vercel-ip-country.
const EU = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'] as const
const EEA_OUTSIDE_EU = ['IS', 'LI', 'NO'] as const
const OTHERS = ['GB', 'CH'] as const

export const CONSENT_COUNTRIES: ReadonlySet<string> = new Set<string>([...EU, ...EEA_OUTSIDE_EU, ...OTHERS])

// No country (local dev, a proxy that strips the header, Vercel's "XX") counts as asking: when
// in doubt the visitor is treated as someone whose consent is needed.
export function needsConsent(country: string | null | undefined): boolean {
  const code = country?.trim().toUpperCase()
  if (!code || !/^[A-Z]{2}$/.test(code) || code === 'XX') return true
  return CONSENT_COUNTRIES.has(code)
}

// Set by the proxy on every page response for visitors outside those countries only, and removed
// for everyone else, so a visitor who must be asked gets nothing written before they answer.
// Session cookie, readable by the page (not httpOnly): it carries no identifier, only "open".
export const REGION_COOKIE = 'sv_analytics_region'
export const REGION_OPEN = 'open'

// Outside production only: ?sv_country=DE makes the proxy act as if the visitor were in that
// country (kept in a session cookie until ?sv_country= clears it), so the bar can be checked on
// the test site from anywhere (T70 handoff). Production ignores both.
export const TEST_COUNTRY_PARAM = 'sv_country'
export const TEST_COUNTRY_COOKIE = 'sv_test_country'
