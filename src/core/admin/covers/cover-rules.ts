// Cover upload rules (ARCHITECTURE §8.3), shared by the editor (browser checks) and the server
// (which re-checks the stored bytes). Client-safe: no server-only imports.
//
//   before / after   still JPEG / PNG / WebP ≤ 20MB → WebP, long edge 1600, quality 82
//   motion           GIF or animated WebP ≤ 20MB → animated WebP (+ first frame as poster)
//                    or MP4 (H.264) ≤ 15MB, ≤ 15s, stored as is, with a poster frame the
//                    browser grabs from the first frame and uploads alongside
//   poster           the MP4's first frame, JPEG / PNG / WebP → WebP like a still

export const COVER_PURPOSES = ['before', 'after', 'motion', 'poster'] as const
export type CoverPurpose = (typeof COVER_PURPOSES)[number]

export const COVER_STILL_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export const COVER_MOTION_TYPES = ['image/gif', 'image/webp', 'video/mp4'] as const

const MB = 1024 * 1024
export const MAX_COVER_IMAGE_BYTES = 20 * MB
export const MAX_COVER_VIDEO_BYTES = 15 * MB
export const MAX_COVER_VIDEO_SECONDS = 15

export const COVER_STILL_EDGE = 1600
export const COVER_STILL_QUALITY = 82
export const COVER_STILL_EFFORT = 6
// Animations play in a card, so a smaller edge keeps first paint light (GIF-sized files
// would undo the reason we convert them).
export const COVER_ANIMATED_EDGE = 1080
export const COVER_ANIMATED_QUALITY = 75

export const COVER_UPLOAD_TTL_SECONDS = 300

export function allowedTypes(purpose: CoverPurpose): readonly string[] {
  return purpose === 'motion' ? COVER_MOTION_TYPES : COVER_STILL_TYPES
}

export const maxBytesFor = (contentType: string) => (contentType === 'video/mp4' ? MAX_COVER_VIDEO_BYTES : MAX_COVER_IMAGE_BYTES)

export const acceptFor = (purpose: CoverPurpose) => allowedTypes(purpose).join(',')

// null when the file may be uploaded; otherwise what to tell the admin.
export function coverFileProblem(purpose: CoverPurpose, file: { type: string; size: number }): string | null {
  if (!allowedTypes(purpose).includes(file.type)) {
    return purpose === 'motion' ? '动态封面只收 GIF、动态 WebP 或 MP4' : '只收 JPEG、PNG 或 WebP'
  }
  if (file.size > maxBytesFor(file.type)) return file.type === 'video/mp4' ? '视频不能超过 15MB' : '图片不能超过 20MB'
  return null
}
