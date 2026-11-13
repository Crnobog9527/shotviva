import { publishFixture } from './helpers'
import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { vi } from 'vitest'

import type { GenerationProvider, ProviderInput } from '@/core/jobs'
import { ProviderError } from '@/core/jobs'

import { png } from '../fakes/images'

// A published web template with a wrapped prompt, the way an admin would set one up. Priced
// as a medium template (1 / 2 / 3), so Standard costs 1.
// credits: a slot template must cover the single-image floor × its slots (migration 1310), so
// its fixtures pass a higher price than the default 1 / 2 / 3.
export async function seedTemplate(db: Client, options: { visibleIn?: string[]; images?: object; copy?: object[]; body?: string; credits?: Record<'1k' | '2k' | '3k', number> } = {}) {
  const id = `t4-${randomUUID().slice(0, 8)}`
  const fields = {
    images: options.images ?? { min: 1, max: 1 },
    copy: options.copy ?? [{ key: 'dish', label: 'Dish', required: false, maxLength: 60 }],
    aspectRatios: ['4:5', '1:1'],
  }
  await db.query(
    `insert into public.templates (id, name, category, fields, quality, credits_cost, is_active, visible_in)
     values ($1, 'T4 test', 'pets', $2, 'medium', $4, false, $3)`,
    [id, JSON.stringify(fields), options.visibleIn ?? ['web'], JSON.stringify(options.credits ?? { '1k': 1, '2k': 2, '3k': 3 })],
  )
  await db.query('insert into public.template_prompts (template_id, body) values ($1, $2)', [
    id,
    options.body ?? 'WRAPPED studio shot of {{dish}}, keep the plate unchanged',
  ])
  await publishFixture(db, id)
  return id
}

export type FakeBehaviour = 'ok' | 'reject' | 'fail' | 'hang'

// OpenAI stand-in (AGENTS §7: no real network in tests). Records every call it gets.
export function fakeProvider(behaviour: FakeBehaviour = 'ok') {
  const calls: Omit<ProviderInput, 'signal'>[] = []
  const generate = vi.fn(async (input: ProviderInput) => {
    calls.push({
      prompt: input.prompt,
      images: input.images,
      aspectRatio: input.aspectRatio,
      resolution: input.resolution,
      quality: input.quality,
      params: input.params,
    })
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
