import { createHash } from 'node:crypto'

import type { SupabaseClient } from '@supabase/supabase-js'
import sharp from 'sharp'

import { outputKeyFor } from '../../src/core/storage/keys'
import { resetPool, rpc } from './ledger'
import type { QaStorage } from './storage'

// qa-creator's one succeeded work, recorded the way a real generation is (reserve_credits,
// then the output in R2, then confirm_job), minus the provider call.

// Name-based (version 5 layout) so every run addresses the same job: reserve_credits and
// confirm_job both return the existing row for a known id instead of charging again.
export function creatorJobId(userId: string): string {
  const hex = createHash('sha1').update(`qa-creator-work:${userId}`).digest('hex').slice(0, 32).split('')
  hex[12] = '5'
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16)
  const s = hex.join('')
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`
}

async function placeholderPng(): Promise<Uint8Array> {
  const label = `<svg width="768" height="1024"><text x="384" y="512" font-size="44" text-anchor="middle"
    fill="#d9d4c7" font-family="sans-serif">QA placeholder</text></svg>`
  return sharp({ create: { width: 768, height: 1024, channels: 3, background: '#2b2a28' } })
    .composite([{ input: Buffer.from(label) }])
    .png()
    .toBuffer()
}

// Uses templates_active_sort_idx (sort_order, id) where is_active.
async function firstActiveTemplate(db: SupabaseClient): Promise<{ id: string; cost: number }> {
  const { data, error } = await db
    .from('templates')
    .select('id, credits_cost')
    .eq('is_active', true)
    .order('sort_order')
    .order('id')
    .limit(1)
  if (error) throw new Error(`templates read failed: ${error.message}`)
  if (data.length === 0) throw new Error('No active template; import one (pnpm import:prompts) before qa:accounts.')
  return { id: data[0].id as string, cost: Number((data[0].credits_cost as Record<string, number>)['1k']) }
}

async function jobStatus(db: SupabaseClient, jobId: string): Promise<string | null> {
  const { data, error } = await db.from('generation_jobs').select('status').eq('id', jobId).maybeSingle()
  if (error) throw new Error(`job read failed: ${error.message}`)
  return (data?.status as string | undefined) ?? null
}

// Returns true when this run recorded the work.
export async function ensureCreatorWork(
  db: SupabaseClient,
  storage: QaStorage,
  userId: string,
  paidTarget: number,
): Promise<boolean> {
  const jobId = creatorJobId(userId)
  const outputKey = outputKeyFor(userId, jobId)
  const status = await jobStatus(db, jobId)
  if (status === 'failed') throw new Error(`qa-creator job ${jobId} is failed; delete qa-creator and rerun.`)
  // Rewritten each run (same key, same bytes) so a cleared bucket heals itself.
  await storage.put(outputKey, await placeholderPng(), 'image/png')
  if (status === 'succeeded') return false
  if (status === null) {
    const template = await firstActiveTemplate(db)
    // Room for the charge on top of the target; the reset after this brings it back.
    await resetPool(db, userId, 'paid', paidTarget + template.cost)
    await rpc(db, 'reserve_credits', {
      p_job_id: jobId,
      p_user_id: userId,
      p_module: 'image',
      p_template_id: template.id,
      p_credits_cost: null,
      p_source: 'web',
      p_inputs: { resolution: '1k' },
      p_provider: null,
      p_idempotency_key: null,
      p_visibility: 'private',
    })
  }
  await rpc(db, 'confirm_job', { p_job_id: jobId, p_output_key: outputKey })
  return true
}
