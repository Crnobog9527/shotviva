import 'server-only'

// Work collection sharing (ARCHITECTURE §6.2「作品集分享」): server side. The browser half lives in
// modules/image/work-share.
export { isShareImageSide, sharedImagePath, sharedImageUrl, worksWithBefore, type ShareImageSide } from './share-images'
export {
  createShareSchema,
  isWorkShareId,
  WORK_SHARE_MAX_WORKS,
  WORK_SHARE_NOTE_MAX,
  WORK_SHARE_TITLE_MAX,
  type CreateShareInput,
  type OwnShare,
  type WorkShare,
} from './share-schema'
export { createWorkShare, listWorkShares, OWN_SHARES_PAGE, readWorkShare, revokeWorkShare, WORK_SHARE_TOO_OFTEN } from './share-store'
export { loadWorkShareView, shareViewOf, type SharedWorkView, type WorkShareView } from './share-view'
