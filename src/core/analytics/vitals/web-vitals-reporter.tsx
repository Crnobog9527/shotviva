'use client'

import { useReportWebVitals } from 'next/web-vitals'

import { reportVital } from './browser'

// Loaded on idle by WebVitalsSlot, so next/web-vitals stays out of the app's first-load JS. Its
// observers read buffered entries: LCP, FCP and TTFB measured before this mounted still arrive.
// A stable function reference, as useReportWebVitals asks, so nothing is reported twice.
const report = (metric: Parameters<typeof reportVital>[0]) => reportVital(metric)

export default function WebVitalsReporter() {
  useReportWebVitals(report)
  return null
}
