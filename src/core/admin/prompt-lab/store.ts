import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '@/core/errors'
import { decodeCursor, encodeCursor } from '../cursor'
import { readInput } from '../reference-library/inputs'
import type { LabPage, LabRun, LabVersion, ReverseSettings } from './types'

const size = 30
const runColumns = 'id,batch_id,photo_id,version_id,model,resolution,quality,status,estimate_usd,cost_usd,error_code,' +
  'started_at,starred,is_best,use_style_reference,prompt_lab_versions!inner(version_no)'

export async function readLabRuns(db: SupabaseClient, sessionId: string, after?: string): Promise<LabPage<LabRun>> {
  const query = db.from('prompt_lab_runs').select(runColumns).eq('session_id', sessionId)
    .order('started_at', { ascending: false }).order('id', { ascending: false }).limit(size + 1)
  if (after) {
    const cursor = decodeCursor(after)
    if (!cursor || !z.uuid().safeParse(cursor.i).success) throw new AppError('INVALID_INPUT', '分页位置无效')
    query.or(`started_at.lt."${cursor.c}",and(started_at.eq."${cursor.c}",id.lt.${cursor.i})`)
  }
  const { data, error } = await query.returns<LabRun[]>()
  if (error) throw new AppError('INTERNAL', '无法读取试跑记录')
  const last = data[size - 1]
  return { items: data.slice(0, size), next: data.length > size ? encodeCursor({ created_at: last.started_at, id: last.id }) : null }
}

export async function readLabVersions(db: SupabaseClient, sessionId: string, after?: string): Promise<LabPage<LabVersion>> {
  const query = db.from('prompt_lab_versions').select('id,version_no,note')
    .eq('session_id', sessionId).order('version_no', { ascending: false }).limit(size + 1)
  if (after) query.lt('version_no', readInput(z.coerce.number().int().positive(), after))
  const { data, error } = await query.returns<LabVersion[]>()
  if (error) throw new AppError('INTERNAL', '无法读取版本列表')
  return { items: data.slice(0, size), next: data.length > size ? String(data[size - 1].version_no) : null }
}

export async function labSession(db: SupabaseClient, sessionId: string) {
  const { data, error } = await db.from('prompt_lab_sessions').select('asset_id,reference_assets!inner(status)')
    .eq('id', sessionId).maybeSingle<{ asset_id: string; reference_assets: { status: 'active' | 'archived' } }>()
  if (error) throw new AppError('INTERNAL', '无法读取调试记录')
  return data
}

export async function versionDetail(db: SupabaseClient, sessionId: string, id: string) {
  const { data, error } = await db.from('prompt_lab_versions').select('id,version_no,prompt,note')
    .eq('session_id', sessionId).eq('id', id).maybeSingle()
  if (error) throw new AppError('INTERNAL', '无法读取版本')
  if (!data) throw new AppError('NOT_FOUND', '版本已不存在')
  return data
}

export async function reverseSettings(db: SupabaseClient): Promise<ReverseSettings> {
  const { data, error } = await db.from('system_settings').select('value').eq('key', 'prompt_lab_reverse').maybeSingle()
  if (error) throw new AppError('INTERNAL', '无法读取倒推设置')
  return data?.value ?? { model: '', instruction: '' }
}
