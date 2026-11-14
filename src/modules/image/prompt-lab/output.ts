import 'server-only'
import sharp from 'sharp'
import { AppError } from '@/core/errors'
import { sniffImageType, type ObjectStore } from '@/core/storage'

// OpenAI-compatible endpoints can ignore output_format. Verify and normalize their bytes
// before lab previews and publication rely on a .png key and image/png response.
export async function storeLabOutput(store: ObjectStore, key: string, bytes: Uint8Array) {
  const type = sniffImageType(bytes)
  if (!type || type === 'image/heic') throw new AppError('GENERATION_FAILED', '供应商未返回有效结果图')
  const png = await sharp(bytes, { limitInputPixels: 32_000_000, failOn: 'warning' }).rotate().png().toBuffer()
  await store.put(key, png, 'image/png', { cacheControl: 'private, no-store' })
  return []
}
