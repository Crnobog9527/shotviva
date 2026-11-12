import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'

import type { SupabaseClient } from '@supabase/supabase-js'
import sharp from 'sharp'

import { INPUT_JPEG_QUALITY, INPUT_LONG_EDGE, MAX_UPLOAD_BYTES } from '../../src/core/storage/rules'
import { sniffImageType, type ObjectStore } from '../../src/core/storage'
import { confirmTestPhoto } from '../../src/modules/image/test-run/test-photos'
import { findTestPhoto } from '../../src/modules/image/test-run/test-run-store'
import { uuidFrom } from './cells'

// Test photos from local files, as the admin panel's upload makes them: the browser's compression
// (JPEG, long edge INPUT_LONG_EDGE, INPUT_JPEG_QUALITY), the object under admin-tests/photos/, then
// confirmTestPhoto (thumbnail and the admin_test_photos row). The photo id comes from the file's
// bytes, so the same file is uploaded and listed once however often it is used.

export async function readPhoto(baseDir: string, path: string) {
  const full = resolve(baseDir, path)
  const info = await stat(full).catch(() => null)
  if (!info?.isFile() || info.size < 1 || info.size > MAX_UPLOAD_BYTES) throw new Error(`样图 ${path} 不存在、为空或超过 20MB`)
  const bytes = new Uint8Array(await readFile(full))
  if (!sniffImageType(bytes)) throw new Error(`样图 ${path} 不是 JPEG、PNG 或 WebP`)
  return { bytes, hash: createHash('sha256').update(bytes).digest('hex') }
}

async function compress(bytes: Uint8Array) {
  return sharp(bytes, { limitInputPixels: 120_000_000 }).rotate()
    .resize({ width: INPUT_LONG_EDGE, height: INPUT_LONG_EDGE, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: Math.round(INPUT_JPEG_QUALITY * 100) }).toBuffer()
}

export async function ensureTestPhoto(deps: { db: SupabaseClient; store: ObjectStore }, actorId: string, photo: { bytes: Uint8Array; hash: string }) {
  const id = uuidFrom(photo.hash)
  if (await findTestPhoto(deps.db, id)) return id
  const key = `admin-tests/photos/${id}.jpg`
  await deps.store.put(key, await compress(photo.bytes), 'image/jpeg')
  await confirmTestPhoto(deps, actorId, id, key)
  return id
}
