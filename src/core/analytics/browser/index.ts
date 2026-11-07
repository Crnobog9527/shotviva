// Browser entry (ARCHITECTURE §16). Server code imports '@/core/analytics'.
export { identify, initBrowserAnalytics, onRouterTransitionStart, resetIdentity, track, trackContactSales, trackPaywallView } from './client'
export { AnalyticsIdentify } from './analytics-identify'
export { captureAlert, captureError } from './capture'
export { type AlertKind } from '../capture-scope'
export { uploadSizeBucket } from '../events'
