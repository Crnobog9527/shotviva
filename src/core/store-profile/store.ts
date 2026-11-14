import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '../errors'
import { logger } from '../logger'
import { contentTypeOfKey, isOwnInputKey, isStoreQrKey, newInputKey, newStoreQrKey, type ObjectStore } from '../storage'
import { EMPTY_STORE, storeIsEmpty, storeTextSchema, type StoreProfile, type StoreQr, type StoreText } from './profile'

// Reading and saving 店铺信息 (§5.3「每周复用」, table store_profiles 1520). Service-role client:
// the table takes no client writes. The QR code lives under outputs/{user_id}/ as a copy of the
// user's upload (server-side R2 copy, no bytes through a function, AGENTS §6); the editors get
// a fresh upload copied from it each time, exactly like Make again's kept photos (T40).

const COLUMNS = 'name, name_en, phones, address, wechat, qr_key, autofill'
const rowSchema = z.object({
  name: z.string(), name_en: z.string(), phones: z.array(z.string()), address: z.string(), wechat: z.string(),
  qr_key: z.string().nullable(), autofill: z.boolean(),
})
type Row = z.infer<typeof rowSchema>

const PREVIEW_SECONDS = 3600

const toText = (row: Row): StoreText => ({ name: row.name, nameEn: row.name_en, phones: row.phones, address: row.address, wechat: row.wechat, autofill: row.autofill })

async function readRow(db: SupabaseClient, userId: string): Promise<Row | null> {
  const { data, error } = await db.from('store_profiles').select(COLUMNS).eq('user_id', userId).maybeSingle()
  if (error) throw new AppError('INTERNAL', 'store_profiles read failed', { cause: new Error(error.message) })
  const row = rowSchema.safeParse(data)
  return row.success ? row.data : null
}

// The text and whether a QR code is kept; nothing is copied.
export async function readStoreText(db: SupabaseClient, userId: string): Promise<(StoreText & { hasQr: boolean }) | null> {
  const row = await readRow(db, userId)
  return row ? { ...toText(row), hasQr: Boolean(row.qr_key) } : null
}

// For the settings card: the text and a short-lived link to show the kept QR code.
export async function readStoreProfile(db: SupabaseClient, store: () => ObjectStore, userId: string): Promise<StoreProfile> {
  const row = await readRow(db, userId)
  if (!row) return { ...EMPTY_STORE, hasQr: false, qrUrl: null }
  const qrUrl = row.qr_key ? await store().presignGet(row.qr_key, { expiresInSeconds: PREVIEW_SECONDS }).catch(() => null) : null
  return { ...toText(row), hasQr: Boolean(row.qr_key), qrUrl }
}

// The kept QR code as a fresh inputs/ upload for a poster's QR box; null when there is none or
// the copy fails (the editor then simply leaves the box empty).
export async function storeQrUpload(db: SupabaseClient, store: ObjectStore, userId: string): Promise<StoreQr | null> {
  const row = await readRow(db, userId)
  const kept = row?.qr_key
  const contentType = kept ? contentTypeOfKey(kept) : null
  if (!kept || !contentType || !isStoreQrKey(userId, kept)) return null
  try {
    const head = await store.head(kept)
    if (!head) return null
    const inputKey = newInputKey(userId, contentType)
    await store.copy(kept, inputKey)
    return { inputKey, bytes: head.size, url: await store.presignGet(inputKey, { expiresInSeconds: PREVIEW_SECONDS }) }
  } catch (error) {
    logger.warn('store_profile.qr_copy_failed', { error })
    return null
  }
}

export const saveStoreSchema = storeTextSchema.extend({
  // A new upload to keep (inputs/ key), 'remove', or undefined to leave the kept one as it is.
  qr: z.union([z.string().max(200), z.literal('remove')]).optional(),
})
export type SaveStoreInput = z.input<typeof saveStoreSchema>

// The new QR's kept key: the upload, checked as the caller's own and copied under outputs/.
async function keepQr(store: ObjectStore, userId: string, upload: string): Promise<string> {
  const contentType = contentTypeOfKey(upload)
  if (!isOwnInputKey(userId, upload) || !contentType) throw new AppError('INVALID_INPUT', 'Unknown upload')
  if (!(await store.head(upload))) throw new AppError('INVALID_INPUT', 'Upload missing')
  const kept = newStoreQrKey(userId, contentType)
  await store.copy(upload, kept)
  return kept
}

async function nextQrKey(store: () => ObjectStore, userId: string, qr: string | undefined, kept: string | null): Promise<string | null> {
  if (qr === 'remove') return null
  return qr ? keepQr(store(), userId, qr) : kept
}

async function dropReplacedQr(store: () => ObjectStore, before: string | null, now: string | null) {
  if (!before || before === now) return
  await store().delete(before).catch((cause: unknown) => logger.warn('store_profile.qr_delete_failed', { error: cause }))
}

// One upsert. An emptied profile (no text, no QR) is deleted rather than kept as a blank row.
export async function saveStoreProfile(db: SupabaseClient, store: () => ObjectStore, userId: string, raw: unknown): Promise<StoreProfile> {
  const input = saveStoreSchema.safeParse(raw)
  if (!input.success) throw new AppError('INVALID_INPUT', input.error.issues[0]?.message ?? 'Invalid store details')
  const before = await readRow(db, userId)
  const { qr, ...text } = input.data
  const qrKey = await nextQrKey(store, userId, qr, before?.qr_key ?? null)
  const row = { user_id: userId, name: text.name, name_en: text.nameEn, phones: text.phones, address: text.address, wechat: text.wechat, qr_key: qrKey, autofill: text.autofill, updated_at: new Date().toISOString() }
  const { error } = storeIsEmpty(text, Boolean(qrKey))
    ? await db.from('store_profiles').delete().eq('user_id', userId)
    : await db.from('store_profiles').upsert(row, { onConflict: 'user_id' })
  if (error) throw new AppError('INTERNAL', 'store_profiles save failed', { cause: new Error(error.message) })
  // The replaced QR copy goes; a failure only leaves an orphan the account deletion clears.
  await dropReplacedQr(store, before?.qr_key ?? null, qrKey)
  return readStoreProfile(db, store, userId)
}

// 「以后不自动填」 from an editor: only the switch changes.
export async function setStoreAutofill(db: SupabaseClient, userId: string, autofill: boolean): Promise<void> {
  const { error } = await db.from('store_profiles').update({ autofill, updated_at: new Date().toISOString() }).eq('user_id', userId)
  if (error) throw new AppError('INTERNAL', 'store_profiles update failed', { cause: new Error(error.message) })
}
