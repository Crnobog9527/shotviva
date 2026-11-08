// The new-version banner (T90). Server code imports './server' for GET /api/version.
export { UpdateSlot } from './update-slot'
export { useUpdateHold, type HoldKind } from './holds'
export { reportIfStaleBuild, watchStaleBuild } from './stale-build'
