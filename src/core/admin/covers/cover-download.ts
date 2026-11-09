import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '@/core/errors'
import type { ObjectStore } from '@/core/storage'
import { templateInputSchema } from '@/core/templates'

import { requireCurrentStillCover } from './current-still-cover'

const query = z.strictObject({
  templateId: templateInputSchema.shape.id,
  slot: z.enum(['before', 'after']),
  hash: z.string().regex(/^(?:[0-9a-f]{16}|[0-9a-f]{64})$/),
  locale: z.string().regex(/^[a-z]{2,3}(-[a-z0-9]{2,8})?$|^common$/),
})

export async function signCoverDownload(db: SupabaseClient, store: ObjectStore, input: unknown) {
  const parsed = query.safeParse(input)
  if (!parsed.success) throw new AppError('INVALID_INPUT', '封面下载参数无效')
  const { templateId, slot, hash, locale } = parsed.data
  const { key } = await requireCurrentStillCover(db, templateId, locale === 'common' ? null : locale, slot, hash)
  const extension = key.slice(key.lastIndexOf('.') + 1)
  return store.presignGet(key, {
    expiresInSeconds: 60, downloadName: `${templateId}-${locale}-${slot}-${hash.slice(0, 16)}.${extension}`,
  })
}
