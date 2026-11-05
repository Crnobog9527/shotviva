import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { vi } from 'vitest'

import type { GenerationProvider, ProviderInput } from '@/core/jobs'
import { ProviderError } from '@/core/jobs'

import { png } from '../fakes/images'

// A published web template with a wrapped prompt, the way an admin would set one up.
export async function seedTemplate(db: Client, options: { visibleIn?: string[]; images?: { min: number; max: number } } = {}) {
  const id = `t4-${randomUUID().slice(0, 8)}`
  const fields = {
    images: options.images ?? { min: 1, max: 1 },
    copy: [{ key: 'dish', label: 'Dish', required: false, maxLength: 60 }],
    aspectRatios: ['4:5', '1:1'],
  }
  await db.query(
    `insert into public.templates (id, name, category, fields, credits_cost, is_active, visible_in)
     values ($1, 'T4 test', 'test', $2, 1, true, $3)`,
    [id, JSON.stringify(fields), options.visibleIn ?? ['web']],
  )
  await db.query('insert into public.template_prompts (template_id, body) values ($1, $2)', [
    id,
    'WRAPPED studio shot of {{dish}}, keep the plate unchanged',
  ])
  return id
}

export type FakeBehaviour = 'ok' | 'reject' | 'fail' | 'hang'

// OpenAI stand-in (AGENTS §7: no real network in tests). Records every call it gets.
export function fakeProvider(behaviour: FakeBehaviour = 'ok') {
  const calls: Omit<ProviderInput, 'signal'>[] = []
  const generate = vi.fn(async (input: ProviderInput) => {
    calls.push({ prompt: input.prompt, images: input.images, aspectRatio: input.aspectRatio, params: input.params })
    if (behaviour === 'reject') throw new ProviderError('content_rejected', 'moderation_blocked')
    if (behaviour === 'fail') throw new ProviderError('failed', 'openai 503')
    if (behaviour === 'hang') return new Promise<never>(() => {})
    return { bytes: await png(1232, 1536), contentType: 'image/png' as const }
  })
  const provider: GenerationProvider = { id: 'fake-openai', generate }
  return { provider, calls, generate }
}

export async function jobRow(db: Client, jobId: string) {
  const { rows } = await db.query<{ status: string; error_code: string | null; output_key: string | null; visibility: string }>(
    'select status, error_code, output_key, visibility from public.generation_jobs where id = $1',
    [jobId],
  )
  return rows[0] ?? null
}

export async function jobCount(db: Client, userId: string) {
  const { rows } = await db.query<{ n: string }>('select count(*) as n from public.generation_jobs where user_id = $1', [userId])
  return Number(rows[0]?.n ?? 0)
}
