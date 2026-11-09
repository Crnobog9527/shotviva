import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { AppError } from '@/core/errors'
import { coverLocalesSchema, effectiveStillCover } from '@/core/templates'
import { stillCoverKey } from './still-cover-key'

export async function requireCurrentStillCover(db: SupabaseClient, id: string, locale: string | null, slot: 'before' | 'after', hash: string) {
  const { data, error } = await db.from('templates').select('cover_before_url,cover_after_url,cover_locales').eq('id', id).maybeSingle()
  if (error) throw new AppError('INTERNAL', '读取模板封面失败', { cause: error })
  if (!data) throw new AppError('NOT_FOUND', '找不到这个模板')
  const common = slot === 'before' ? data.cover_before_url : data.cover_after_url
  const url = effectiveStillCover(coverLocalesSchema.parse(data.cover_locales), locale, slot, common)
  const source = stillCoverKey(id, slot, url)
  if (!source || source.hash !== hash) throw new AppError('CONFLICT', '封面已变更，请刷新后重试')
  return source
}
