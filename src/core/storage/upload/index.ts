// The browser side of an upload (ARCHITECTURE §8.2): compress to a ≤2048px JPEG, ask
// /api/uploads for a presigned PUT, send it straight to R2 with progress. Client-safe. Used by
// the generation workspace (modules/image) and the support-ticket images (core/support, T69).
export { compressImage, targetSize } from './compress-image'
export { putWithProgress } from './put-with-progress'
export { requestTicket } from './request-ticket'
export { checkPickedFile, isAbort, UploadError, uploadPhoto, type UploadCallbacks, type UploadDeps, type UploadErrorCode, type UploadPhase } from './upload-photo'
