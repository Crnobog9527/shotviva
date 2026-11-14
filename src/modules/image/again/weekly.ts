import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '@/core/errors'
import { logger } from '@/core/logger'
import type { ObjectStore } from '@/core/storage'
import type { StoreQr, StoreText } from '@/core/store-profile'
import { readStoreText, setStoreAutofill, storeQrUpload } from '@/core/store-profile/store'

import { loadLast, peekLast, type LastIssue, type LastPeek } from './load-last'

// The weekly-reuse calls an editor makes for one template (§5.3「每周复用」): on open, whether
// there is a last issue and the store details (text only); on a tap, the last issue itself, the
// store's QR code as a fresh upload, or 「以后不自动填」.

type Deps = { db: SupabaseClient; store: () => ObjectStore }

export type WeeklyPeek = { last: LastPeek | null; store: (StoreText & { hasQr: boolean }) | null }

const idSchema = z.string().min(1).max(96)
// The other styles of the template's series, read by the editor from the catalogue. Only the
// caller's own works are read, so an id here can never reach anyone else's.
const alsoSchema = z.array(idSchema).max(12)

export function templateIdsOf(templateId: string, also: unknown): string[] {
  const id = idSchema.safeParse(templateId)
  const rest = alsoSchema.safeParse(also)
  if (!id.success || !rest.success) throw new AppError('INVALID_INPUT', 'Unknown template')
  return [...new Set([id.data, ...rest.data])]
}

export async function weeklyPeek(deps: Deps, userId: string, templateIds: readonly string[]): Promise<WeeklyPeek> {
  // The store details are a nicety: a failed read (or a database without 1520 yet) offers none.
  const [last, store] = await Promise.all([
    peekLast(deps.db, userId, templateIds),
    readStoreText(deps.db, userId).catch((error: unknown) => { logger.warn('weekly.store_read_failed', { error }); return null }),
  ])
  return { last, store }
}

export const weeklyActionSchema = z.discriminatedUnion('want', [
  z.object({ want: z.literal('last'), also: alsoSchema.default([]) }),
  z.object({ want: z.literal('store_qr') }),
  z.object({ want: z.literal('autofill_off') }),
])

export async function weeklyAct(deps: Deps, userId: string, templateId: string, raw: unknown): Promise<LastIssue | StoreQr | { ok: true } | null> {
  const body = weeklyActionSchema.safeParse(raw)
  if (!body.success) throw new AppError('INVALID_INPUT', 'Unknown request')
  if (body.data.want === 'store_qr') return storeQrUpload(deps.db, deps.store(), userId)
  if (body.data.want === 'autofill_off') {
    await setStoreAutofill(deps.db, userId, false)
    return { ok: true }
  }
  const last = await loadLast(deps, userId, templateIdsOf(templateId, body.data.also))
  if (!last) throw new AppError('NOT_FOUND', 'No earlier work of this template')
  return last
}
