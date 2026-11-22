// Free-work protection (Owner 2026-11-22): the protected copy, its geometry, and the admin-side
// reader of the tracking mark.
export { FREE_MAX_EDGE, freeCopySize, type SizeRule } from './mark-geometry'
export { CONTENT_TYPE, protectImage, type ProtectedFormat, type ProtectRequest } from './protect'
export { prefixRange } from './tracking-code'
export { readTrackingMark, type TrackingRead } from './tracking-decode'
