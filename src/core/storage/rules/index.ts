// Upload rules shared by the browser (modules/image/workspace) and the server checks.
// Client-safe on purpose: no server-only imports here.

// 20MB is the file picker's limit, not what we store: the browser compresses first and the
// original never leaves the device (ARCHITECTURE §8.2). The server re-checks with HEAD
// because a presigned PUT cannot cap the body size.
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024

// No HEIC: Vercel's sharp has no HEIF decoder, and iOS converts to JPEG when it is not offered.
export const UPLOAD_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export type UploadContentType = (typeof UPLOAD_CONTENT_TYPES)[number]

export const UPLOAD_ACCEPT = UPLOAD_CONTENT_TYPES.join(',')

export function isUploadContentType(value: string): value is UploadContentType {
  return (UPLOAD_CONTENT_TYPES as readonly string[]).includes(value)
}

// Inputs beyond a 2048 long edge add upload time and nothing to the output.
export const INPUT_LONG_EDGE = 2048
export const INPUT_JPEG_QUALITY = 0.85

export const UPLOAD_URL_TTL_SECONDS = 60
