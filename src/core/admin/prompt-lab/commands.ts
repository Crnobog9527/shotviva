import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '@/core/errors'
import { readInput } from '../reference-library/inputs'

const sessionId = z.uuid()
const input = z.discriminatedUnion('op', [
  z.object({ op: z.literal('open'), assetId: z.uuid() }),
  z.object({ op: z.literal('version'), sessionId, mode: z.enum(['create', 'copy', 'edit']),
    versionId: z.uuid().nullable(), prompt: z.string().trim().min(1).max(32000).nullable(), note: z.string().trim().max(2000).nullable() }),
  z.object({ op: z.literal('mark'), sessionId, runId: z.uuid(), starred: z.boolean().nullable(), best: z.boolean().nullable() }),
])
export const reverseInput = z.object({ model: z.union([z.uuid(), z.literal('')]), instruction: z.string().trim().max(32000) })
  .refine(p => !!p.model === !!p.instruction)

function rpcFailure(message: string) {
  if (message === 'NOT_ADMIN') return new AppError('NOT_FOUND', '无权访问')
  if (message === 'TEST_BUDGET_EXCEEDED') return new AppError('TEST_BUDGET_EXCEEDED', '当日剩余试跑预算不足')
  if (message === 'IDEMPOTENCY_CONFLICT') return new AppError('CONFLICT', '请求已变更，请刷新后重新确认')
  if (message === 'PROMPT_LAB_SETTINGS_CHANGED') return new AppError('CONFLICT', '倒推设置已变更，请刷新后重试')
  if (message.includes('ARCHIVED') || message === 'PROMPT_LAB_UNAVAILABLE') return new AppError('CONFLICT', '素材已归档或不可用')
  if (message.includes('NOT_FOUND')) return new AppError('NOT_FOUND', '记录已不存在')
  if (message === 'INVALID_INPUT') return new AppError('INVALID_INPUT', '请检查输入后再试')
  // PostgreSQL diagnostics can quote private prompt or instruction text.
  return new AppError('INTERNAL', '调试台操作失败')
}

export async function labRpc<T = unknown>(db: SupabaseClient, name: string, params: Record<string, unknown>, schema?: z.ZodType<T>): Promise<T> {
  const { data, error } = await db.rpc(name, params)
  if (error) throw rpcFailure(error.message)
  if (!schema) return data
  const parsed = schema.safeParse(data)
  if (!parsed.success) throw new AppError('INTERNAL', '无法确认调试操作的结果')
  return parsed.data
}

export async function labCommand(db: SupabaseClient, actor: string, value: unknown) {
  const p = readInput(input, value)
  if (p.op === 'open') return { sessionId: await labRpc(db, 'admin_open_prompt_lab', { p_actor: actor, p_asset_id: p.assetId }) }
  if (p.op === 'mark') {
    await labRpc(db, 'admin_mark_prompt_lab_run', { p_actor: actor, p_session_id: p.sessionId,
      p_run_id: p.runId, p_starred: p.starred, p_is_best: p.best })
    return { ok: true }
  }
  if ((p.mode === 'create') !== (p.versionId === null) || (p.mode !== 'copy' && !p.prompt))
    throw new AppError('INVALID_INPUT', '请选择有效版本并填写提示词')
  return { versionId: await labRpc(db, 'admin_save_prompt_lab_version', {
    p_actor: actor, p_session_id: p.sessionId, p_version_id: p.versionId, p_mode: p.mode, p_prompt: p.prompt, p_note: p.note,
  }) }
}
