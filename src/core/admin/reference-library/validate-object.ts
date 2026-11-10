import 'server-only'
import { createHash } from 'node:crypto'
import sharp from 'sharp'

import { AppError } from '@/core/errors'
import type { ObjectStore } from '@/core/storage/object-store'
import { INPUT_LONG_EDGE } from '@/core/storage/rules'
import { sniffImageType } from '@/core/storage/sniff'

const invalidImage = () => new AppError('INVALID_INPUT', '素材须为可读取的单张 WebP，长边最多 2048 像素')

async function dimensions(bytes: Uint8Array) {
  try {
    const image = sharp(bytes, { limitInputPixels: INPUT_LONG_EDGE ** 2, failOn: 'warning' })
    const { width, height, pages, exif, xmp } = await image.metadata()
    if (width > INPUT_LONG_EDGE || height > INPUT_LONG_EDGE || (pages ?? 1) !== 1 || exif || xmp) throw invalidImage()
    // Metadata alone also accepts a file with an intact header but truncated pixel data.
    await image.raw().toBuffer()
    return { width, height }
  } catch {
    throw invalidImage()
  }
}

export async function readReferenceUpload(store: ObjectStore, key: string, expected: { size: number; sha256: string }) {
  const head = await store.head(key)
  if (head?.size !== expected.size || head.contentType !== 'image/webp') throw invalidImage()
  const body = await store.get(key, expected.size + 1)
  if (body.length !== expected.size || sniffImageType(body) !== 'image/webp') throw invalidImage()
  const sha256 = createHash('sha256').update(body).digest('hex')
  if (sha256 !== expected.sha256) throw new AppError('INVALID_INPUT', '文件内容已变更，请重新选择')
  return { body, sha256, ...await dimensions(body) }
}
