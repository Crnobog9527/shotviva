import { publicEnv } from '../../public-env'
import { isStaffBrowser } from '../browser/gallery'
import type { VitalReport } from './fields'
import { vitalsPayload, type MetricLike, type PageFacts } from './payload'

export const VITALS_ENDPOINT = '/api/vitals'

type NavigatorExtras = Navigator & { standalone?: boolean; connection?: { effectiveType?: unknown } }

export function pageFacts(win: Window = window): PageFacts {
  const nav = win.navigator as NavigatorExtras
  return {
    href: win.location.href,
    // iOS reports a home-screen app through navigator.standalone, others through the media query.
    standalone: nav.standalone === true || win.matchMedia?.('(display-mode: standalone)').matches === true,
    sw: Boolean(nav.serviceWorker?.controller),
    net: nav.connection?.effectiveType,
  }
}

// fetch keepalive with credentials 'omit' first: unlike sendBeacon it can leave the session
// cookies off the request, so the report reaches the server with nothing that names anyone.
// sendBeacon only where keepalive fetch is missing.
export function sendVitals(report: VitalReport, win: Window = window): void {
  const body = JSON.stringify(report)
  try {
    void win.fetch(VITALS_ENDPOINT, { method: 'POST', body, keepalive: true, credentials: 'omit', headers: { 'content-type': 'text/plain' } }).catch(() => {})
  } catch {
    win.navigator.sendBeacon?.(VITALS_ENDPOINT, body)
  }
}

// One report per metric per page view: CLS and INP may be handed over again as they grow, and a
// remounted reporter is handed the buffered entries anew. A back/forward-cache restore is a new
// page view with new metrics, so it gets its own key: Safari and Firefox expose no navigationId
// (web-vitals uses 0), and the navigation type alone would not tell two restores apart.
const sent = new Set<string>()
let restores = 0
const watched = new WeakSet<Window>()

// Counts bfcache restores. Called when the reporter loads, before web-vitals adds its own
// pageshow listener, so the count is current when a restore's metrics arrive.
export function watchRestores(win: Window = window): void {
  if (watched.has(win)) return
  watched.add(win)
  win.addEventListener('pageshow', (event) => {
    if ((event as PageTransitionEvent).persisted) restores += 1
  })
}

type ReportedMetric = MetricLike & { id?: unknown; navigationId?: unknown }

const keyOf = (metric: ReportedMetric) =>
  [metric.name, metric.navigationId ?? metric.id ?? '', metric.navigationType ?? '', restores].map(String).join(':')

export function reportVital(metric: ReportedMetric, win: Window = window): void {
  // Admin and QA accounts stay out of the real-user numbers in production; the test site keeps
  // them, so the validation there can see reports arrive.
  if (publicEnv.NEXT_PUBLIC_VERCEL_ENV === 'production' && isStaffBrowser(win.document.cookie)) return
  const key = keyOf(metric)
  if (sent.has(key)) return
  const report = vitalsPayload(metric, pageFacts(win))
  if (!report) return
  sent.add(key)
  sendVitals(report, win)
}

// Tests only.
export function resetSentVitalsForTest(): void {
  sent.clear()
  restores = 0
}
