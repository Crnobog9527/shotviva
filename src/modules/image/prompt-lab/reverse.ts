import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { AppError } from '@/core/errors'
import { providerTag } from '@/core/jobs'
import { findProvider, readProviderKey } from '@/core/providers'
import type { ObjectStore } from '@/core/storage'
import { input, reverseInput } from './contracts'
import { labRpc } from '@/core/admin/prompt-lab/commands'
import { requestReverse, reverseEstimate, visionPreview } from './reverse-provider'
import { assertPromptLabVisionCapability } from './vision-capability'

const outcome = z.object({ status: z.string(), version_id: z.uuid().nullable() })
const claimed = outcome.extend({ claimed: z.boolean() })
const config = z.object({ model: z.uuid(), instruction: z.string().trim().min(1) })
const publicOutcome = (row: z.infer<typeof outcome>) => ({ status: row.status, versionId: row.version_id })

async function loadReverse(db: SupabaseClient, session: string) {
  const [setting, sessionRow] = await Promise.all([
    db.from('system_settings').select('value').eq('key', 'prompt_lab_reverse').maybeSingle(),
    db.from('prompt_lab_sessions').select('asset_id').eq('id', session).maybeSingle(),
  ])
  if (setting.error || sessionRow.error) throw new AppError('INTERNAL', '无法读取倒推设置')
  const saved = config.safeParse(setting.data?.value)
  if (!saved.success) throw new AppError('INVALID_INPUT', '请先设置倒推模型和元指令')
  if (!sessionRow.data) throw new AppError('NOT_FOUND', '调试会话不存在')
  const provider = await findProvider(db, saved.data.model)
  if (!provider) throw new AppError('INVALID_INPUT', '倒推模型已移除')
  await assertPromptLabVisionCapability(provider, db)
  const key = await readProviderKey(db, provider.id)
  if (!key) throw new AppError('INVALID_INPUT', '倒推模型未配置密钥')
  return { provider, key, instruction: saved.data.instruction, assetId: z.uuid().parse(sessionRow.data.asset_id) }
}

export async function reverseLabPrompt(deps: { db: SupabaseClient; store: ObjectStore }, actor: string, raw: unknown) {
  const { sessionId, requestId } = input(reverseInput, raw)
  const { provider, key, instruction, assetId } = await loadReverse(deps.db, sessionId)
  const estimate = reverseEstimate(provider, instruction)
  const image = await visionPreview(await deps.store.get(`references/${assetId}.webp`))
  const reservation = await labRpc(deps.db, 'admin_begin_prompt_lab_reverse', {
    p_actor: actor, p_session_id: sessionId, p_request_id: requestId, p_model: providerTag(provider.id, provider.model),
    p_estimate_usd: estimate, p_setting_model: provider.id, p_instruction: instruction,
  }, claimed)
  if (!reservation.claimed) return publicOutcome(reservation)
  let answer: { prompt: string | null; cost: number | null } = { prompt: null, cost: null }
  try {
    answer = await requestReverse(provider, key, instruction, image)
  } catch {
    // A request can be billed even when the response is lost. Keep the reservation.
  }
  return publicOutcome(await labRpc(deps.db, 'admin_finish_prompt_lab_reverse', {
    p_actor: actor, p_request_id: requestId, p_prompt: answer.prompt, p_error_code: answer.prompt ? null : 'REVERSE_FAILED',
    p_cost_usd: answer.cost, p_submitted: true,
  }, outcome))
}
