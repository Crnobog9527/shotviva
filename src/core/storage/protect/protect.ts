import 'server-only'

import sharp, { type Sharp } from 'sharp'

import { WHITE } from '../flatten'
import { freeCopySize, type SizeRule } from './mark-geometry'
import { embedTrackingMark } from './tracking-mark'
import { applyOverlay, overlayFor } from './visible-mark'

// The one way a free work's pixels leave the server (Owner 2026-11-22): every served or saved copy
// of a free-pool work, personal or channel-partner promo credits alike, is
//   1. scaled down, the long edge at most 1080 px (mark-geometry.ts FREE_MAX_EDGE);
//   2. covered by the visible mark: the −30° tiles and the bottom-right
//      「仅供演示 · 未授权商用」 / "Demo only · Not licensed for commercial use" label;
//   3. carrying the invisible tracking mark with the work's id (tracking-code.ts);
//   4. encoded as JPEG, WebP or, for a cut-out's 透明底 file, PNG with its alpha.
// The stored original stays single and clean (ARCHITECTURE §6.2, §8): this only ever makes copies.

export type ProtectedFormat = 'jpeg' | 'webp' | 'png'

export type ProtectRequest = {
  jobId: string
  size: SizeRule
  format: ProtectedFormat
  // 'white': a cut-out sits on white (JPEG has no alpha; lists show cut-outs on white).
  // 'keep': its transparency is kept (the 透明底 PNG, the gallery's WebP).
  background: 'white' | 'keep'
}

const ENCODE = {
  jpeg: (image: Sharp) => image.jpeg({ quality: 86, mozjpeg: true }),
  webp: (image: Sharp) => image.webp({ quality: 80 }),
  png: (image: Sharp) => image.png({ compressionLevel: 9 }),
} as const

export const CONTENT_TYPE: Record<ProtectedFormat, string> = { jpeg: 'image/jpeg', webp: 'image/webp', png: 'image/png' }

export async function protectImage(image: Uint8Array, req: ProtectRequest): Promise<Uint8Array> {
  const { width, height } = await sharp(image).metadata()
  if (!width || !height) throw new Error('protect: image has no dimensions')
  const size = freeCopySize({ width, height }, req.size)
  let base = sharp(image).resize(size.width, size.height, { fit: 'fill' })
  if (req.background === 'white' || req.format === 'jpeg') base = base.flatten({ background: WHITE })
  const [raw, overlay] = await Promise.all([base.ensureAlpha().raw().toBuffer({ resolveWithObject: true }), overlayFor(size)])
  const pixels = new Uint8Array(raw.data.buffer, raw.data.byteOffset, raw.data.length)
  applyOverlay(pixels, overlay)
  embedTrackingMark(pixels, size.width, size.height, req.jobId)
  let out = sharp(raw.data, { raw: { width: size.width, height: size.height, channels: 4 } })
  if (req.format === 'jpeg') out = out.removeAlpha()
  return new Uint8Array(await ENCODE[req.format](out).toBuffer())
}
