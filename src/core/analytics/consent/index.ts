// Who must be asked before analytics may use cookies, and the proxy step that tells the page
// (ARCHITECTURE §16.1, T70). No PostHog in here: the proxy imports it.
export { CONSENT_COUNTRIES, needsConsent, REGION_COOKIE, TEST_COUNTRY_COOKIE, TEST_COUNTRY_PARAM } from './region'
export { analyticsCookiesAllowed, withAnalyticsRegion } from './region-proxy'
