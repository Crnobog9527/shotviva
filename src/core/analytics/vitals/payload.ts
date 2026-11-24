import {
  isOneOf,
  VITAL_EFFECTIVE_TYPES,
  VITAL_METRICS,
  VITAL_NAV_TYPES,
  VITAL_RATINGS,
  type VitalNavType,
  type VitalReport,
} from './fields'
import { pathOf, vitalsRouteRoot } from './route-root'

// The parts of a web-vitals Metric this reads (next/web-vitals ships no types for it).
export type MetricLike = {
  name: unknown
  value: unknown
  rating: unknown
  navigationType?: unknown
  navigationURL?: unknown
}

// What the page knows about itself, read once by the reporter (browser.ts) and passed in.
export type PageFacts = { href: string; standalone: boolean; sw: boolean; net: unknown }

// web-vitals' navigation types onto the five kept. A bfcache restore is a back/forward visit;
// soft navigations (an experimental Chrome signal) are dropped, their URL is a client route change.
function navType(raw: unknown): VitalNavType | null {
  if (raw === 'back-forward-cache' || raw === 'back_forward') return 'back-forward'
  return isOneOf(VITAL_NAV_TYPES, raw) ? raw : null
}

const validValue = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0

// The allowlisted app root of the URL the metric was measured on (navigationURL), so a landing
// page's LCP is never filed under the app page a client-side navigation moved to before it was
// reported.
function measuredOn(metric: MetricLike, page: PageFacts) {
  const measured = typeof metric.navigationURL === 'string' && metric.navigationURL ? metric.navigationURL : page.href
  const path = pathOf(measured, page.href)
  return path ? vitalsRouteRoot(path) : null
}

// One report per metric, or null when it is not one to send: an unknown metric, a page outside
// the allowlisted app roots, a value that is not a finite number.
export function vitalsPayload(metric: MetricLike, page: PageFacts): VitalReport | null {
  if (!isOneOf(VITAL_METRICS, metric.name) || !isOneOf(VITAL_RATINGS, metric.rating) || !validValue(metric.value)) return null
  const nav = navType(metric.navigationType ?? 'navigate')
  const where = nav ? measuredOn(metric, page) : null
  if (!nav || !where) return null
  // CLS is unitless (a few decimals matter); the others are milliseconds.
  const value = metric.name === 'CLS' ? Math.round(metric.value * 10_000) / 10_000 : Math.round(metric.value)
  return {
    metric: metric.name,
    value,
    rating: metric.rating,
    route: where.route,
    locale: where.locale,
    nav,
    standalone: page.standalone,
    sw: page.sw,
    net: isOneOf(VITAL_EFFECTIVE_TYPES, page.net) ? page.net : null,
  }
}
