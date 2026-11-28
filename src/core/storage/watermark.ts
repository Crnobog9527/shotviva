import 'server-only'

import sharp from 'sharp'

import { WHITE } from './flatten'
import { protectImage } from './protect/protect'
import type { DownloadBackground } from './rules/download-background'

// Decided per work, never by the owner's membership (ARCHITECTURE §6.2): works charged to the
// free pool (personal free credits and channel-partner promo credits alike) are always protected,
// paid works never are, whatever their visibility or the owner's paid_until. The single stored
// output stays clean either way; every function here only makes copies.
export function shouldWatermark(creditPool: 'free' | 'paid'): boolean {
  return creditPool === 'free'
}

// What a free copy is marked with: the work's id goes into the invisible tracking mark.
export type FreeMark = { jobId: string }

// A free work's download or display copy (protect/protect.ts: long edge ≤ 1080, visible mark,
// tracking mark). White (the default, and what every display of a free work uses): JPEG on white,
// far below Vercel's 4.5MB body limit (AGENTS §6). Transparent (a cut-out's 透明底 download): PNG
// with its alpha kept, the same mark on top; the caller stages that file on R2.
export async function applyWatermark(image: Uint8Array, mark: FreeMark, background: DownloadBackground = 'white'): Promise<Uint8Array> {
  if (background === 'transparent') return protectImage(image, { jobId: mark.jobId, size: { kind: 'cap' }, format: 'png', background: 'keep' })
  return protectImage(image, { jobId: mark.jobId, size: { kind: 'cap' }, format: 'jpeg', background: 'white' })
}

// The public gallery's copy of a work (ARCHITECTURE §9 第 3、9 条): `width` wide (never up), WebP.
// A free work's copy is protected (its long edge also capped); a paid work's is a clean resize. A
// cut-out keeps its transparency.
export async function galleryImage(image: Uint8Array, width: number, mark: FreeMark | null): Promise<Uint8Array> {
  if (mark) return protectImage(image, { jobId: mark.jobId, size: { kind: 'width', width }, format: 'webp', background: 'keep' })
  return new Uint8Array(await sharp(image).resize({ width, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer())
}

// The small copy of a work its owner sees in lists (ARCHITECTURE §8.3「作品小图」): the short edge
// scaled to `shortEdge` (never up), so it still fills a 4:5 tile whatever the work's shape; a
// cut-out sits on white, as everywhere the app shows one small; protected when the work was made
// with free credits, like the full file. WebP.
// The tile copy cut from a list copy that already exists: the same picture, smaller. No mark is
// added: a free work's list copy carries its protection already.
export async function workTileFromThumb(thumb: Uint8Array, shortEdge: number): Promise<Uint8Array> {
  const scaled = sharp(thumb).resize({ width: shortEdge, height: shortEdge, fit: 'outside', withoutEnlargement: true })
  return new Uint8Array(await scaled.webp({ quality: 78 }).toBuffer())
}

export async function workThumbImage(image: Uint8Array, shortEdge: number, mark: FreeMark | null): Promise<Uint8Array> {
  if (mark) return protectImage(image, { jobId: mark.jobId, size: { kind: 'short-edge', shortEdge }, format: 'webp', background: 'white' })
  const scaled = sharp(image).resize({ width: shortEdge, height: shortEdge, fit: 'outside', withoutEnlargement: true }).flatten({ background: WHITE })
  return new Uint8Array(await scaled.webp({ quality: 78 }).toBuffer())
}
