import 'server-only'

import sharp from 'sharp'

// The decision step only needs a glance at the photo: a 512px JPEG, sent at low detail, keeps
// the request small and fast (ARCHITECTURE §5.2).
const PREVIEW_EDGE = 512

export async function decisionPreview(bytes: Uint8Array): Promise<string> {
  const preview = await sharp(bytes)
    .resize({ width: PREVIEW_EDGE, height: PREVIEW_EDGE, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer()
  return `data:image/jpeg;base64,${preview.toString('base64')}`
}
