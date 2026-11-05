import 'server-only'

import { createHash } from 'node:crypto'

import sharp from 'sharp'

import { AppError } from '@/core/errors'

import {
  COVER_ANIMATED_EDGE,
  COVER_ANIMATED_QUALITY,
  COVER_STILL_EDGE,
  COVER_STILL_QUALITY,
  MAX_COVER_VIDEO_SECONDS,
} from './cover-rules'
import { mp4DurationSeconds } from './mp4-duration'

// Turns an uploaded cover into the files the public bucket serves (ARCHITECTURE §8.3).

export type CoverFile = { bytes: Uint8Array; contentType: 'image/webp' | 'video/mp4'; ext: 'webp' | 'mp4'; hash: string }

export type SniffedCover = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' | 'video/mp4'

const ascii = (bytes: Uint8Array, start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end))

// Same idea as core/storage sniff, plus GIF and MP4 (ISO-BMFF 'ftyp' with a video brand).
const MP4_BRANDS = new Set(['isom', 'iso2', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'M4V ', 'dash'])

const SIGNATURES: { type: SniffedCover; test: (b: Uint8Array) => boolean }[] = [
  { type: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: 'image/png', test: (b) => b[0] === 0x89 && ascii(b, 1, 4) === 'PNG' },
  { type: 'image/webp', test: (b) => ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP' },
  { type: 'image/gif', test: (b) => ascii(b, 0, 4) === 'GIF8' },
  { type: 'video/mp4', test: (b) => ascii(b, 4, 8) === 'ftyp' && MP4_BRANDS.has(ascii(b, 8, 12)) },
]

export function sniffCover(bytes: Uint8Array): SniffedCover | null {
  if (bytes.length < 12) return null
  return SIGNATURES.find((signature) => signature.test(bytes))?.type ?? null
}

const MAX_INPUT_PIXELS = 120_000_000

function file(bytes: Uint8Array, contentType: CoverFile['contentType']): CoverFile {
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 16)
  return { bytes, contentType, ext: contentType === 'video/mp4' ? 'mp4' : 'webp', hash }
}

const decodeFailed = () => new AppError('INVALID_INPUT', '图片无法解码，请换一个文件')

// A still (before / after / poster): first frame only, EXIF orientation baked in, metadata dropped.
export async function stillCover(bytes: Uint8Array): Promise<CoverFile> {
  try {
    const out = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize({ width: COVER_STILL_EDGE, height: COVER_STILL_EDGE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: COVER_STILL_QUALITY })
      .toBuffer()
    return file(new Uint8Array(out), 'image/webp')
  } catch {
    throw decodeFailed()
  }
}

// GIF or animated WebP → animated WebP, plus its first frame as the poster.
export async function animatedCover(bytes: Uint8Array): Promise<{ motion: CoverFile; poster: CoverFile }> {
  let pages: number
  try {
    pages = (await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS }).metadata()).pages ?? 1
  } catch {
    throw decodeFailed()
  }
  if (pages < 2) throw new AppError('INVALID_INPUT', '这张图不是动图；静态图请传到「前图 / 后图」')
  try {
    const out = await sharp(bytes, { animated: true, limitInputPixels: MAX_INPUT_PIXELS })
      .resize({ width: COVER_ANIMATED_EDGE, height: COVER_ANIMATED_EDGE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: COVER_ANIMATED_QUALITY })
      .toBuffer()
    return { motion: file(new Uint8Array(out), 'image/webp'), poster: await stillCover(bytes) }
  } catch {
    throw decodeFailed()
  }
}

// MP4 is stored as uploaded: type and size are checked by the caller, length here.
export function videoCover(bytes: Uint8Array): CoverFile {
  const seconds = mp4DurationSeconds(bytes)
  if (seconds === null) throw new AppError('INVALID_INPUT', '读不出视频时长，请导出为标准 MP4（H.264）')
  if (seconds > MAX_COVER_VIDEO_SECONDS + 0.05) throw new AppError('INVALID_INPUT', `视频不能超过 ${MAX_COVER_VIDEO_SECONDS} 秒`)
  return file(bytes, 'video/mp4')
}
