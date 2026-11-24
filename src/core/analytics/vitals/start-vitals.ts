import { onCLS, onFCP, onINP, onLCP, onTTFB } from 'next/dist/compiled/web-vitals'

import { reportVital, watchRestores } from './browser'

// Loaded on idle by WebVitalsSlot; importing it starts the reporting, and a module runs once per
// page load however often the layout remounts. Calls the web-vitals copy Next itself ships (what
// next/web-vitals' useReportWebVitals calls) directly, so no React wrapper sits in the app's
// first-load JS. Its observers read buffered entries: LCP, FCP and TTFB measured before this ran
// still arrive.
watchRestores(window)
const report = (metric: Parameters<typeof reportVital>[0]) => reportVital(metric)
onCLS(report)
onLCP(report)
onINP(report)
onFCP(report)
onTTFB(report)
