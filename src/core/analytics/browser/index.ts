// Browser entry (ARCHITECTURE §16). Server code imports '@/core/analytics'.
export { identify, initBrowserAnalytics, onRouterTransitionStart, resetIdentity, track, trackPaywallView } from './client'
export { AnalyticsIdentify } from './analytics-identify'
export { captureAlert, captureError, type AlertKind } from '../capture-error'
export { uploadSizeBucket } from '../events'
