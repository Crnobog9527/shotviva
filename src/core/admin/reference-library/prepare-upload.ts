import { INPUT_LONG_EDGE } from '@/core/storage/rules'
import { checkPickedFile, compressImage, UploadError } from '@/core/storage/upload'

// Hash the bytes we intend to store. The server verifies the digest after the private PUT.
export async function prepareReferenceUpload(file: Blob) {
  checkPickedFile(file)
  const body = await compressImage(file, { longEdge: INPUT_LONG_EDGE, type: 'image/webp' })
  // Canvas may return PNG when the requested encoder is unavailable.
  if (body.type !== 'image/webp' || !body.size) throw new UploadError('UPLOAD_FAILED', 'WebP encoding failed')
  checkPickedFile(body)
  const digest = await crypto.subtle.digest('SHA-256', await body.arrayBuffer())
  const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  return { body, sha256 }
}
