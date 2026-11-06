import type { Client } from 'pg'
import { vi } from 'vitest'

import { runGeneration } from '@/core/jobs'
import { newInputKey, type ObjectStore } from '@/core/storage'
import type { ClassifierAnswer, ScopeClassifier } from '@/modules/image'

import { jpeg } from '../fakes/images'
import { fakeProvider } from './generation-fixtures'
import { serviceSupabase } from './supabase-env'

// T30 fixtures. The texts below are test markers, not prompts: the real wrapper, classifier
// instructions and paragraphs are core prompts the Owner writes in admin and never enter git.
export const TEST_EDIT_PARAMS = {
  input_fidelity: 'high',
  classifier: 'CLASSIFIER-INSTRUCTIONS',
  constraints: {
    object: 'C-OBJECT',
    background: 'C-BACKGROUND',
    style: 'C-STYLE',
    subject: 'C-SUBJECT',
    global: 'C-GLOBAL',
    fallback: 'C-FALLBACK',
  },
}
export const TEST_WRAPPER = 'WRAPPER-EDIT'

type Saved = { isActive: boolean; body: string; params: unknown }

// Publishes the seeded `edit` template with the markers above; restore() puts the seed back.
export async function publishEditTemplate(db: Client): Promise<() => Promise<void>> {
  const { rows } = await db.query<{ is_active: boolean; body: string; model_params: unknown }>(
    `select t.is_active, p.body, p.model_params from public.templates t
       join public.template_prompts p on p.template_id = t.id where t.id = 'edit'`,
  )
  const saved: Saved = { isActive: rows[0]!.is_active, body: rows[0]!.body, params: rows[0]!.model_params }
  await setEditTemplate(db, true, TEST_WRAPPER, TEST_EDIT_PARAMS)
  return () => setEditTemplate(db, saved.isActive, saved.body, saved.params)
}

export async function setEditTemplate(db: Client, active: boolean, body: string, params: unknown) {
  await db.query("update public.templates set is_active = $1 where id = 'edit'", [active])
  await db.query("update public.template_prompts set body = $1, model_params = $2 where template_id = 'edit'", [body, JSON.stringify(params)])
}

export type ClassifierBehaviour = Partial<ClassifierAnswer> | 'hang' | 'fail'

// GPT-6 Luna stand-in: answers a fixed classification, hangs, or fails. Records what it was asked.
export function fakeClassifier(behaviour: ClassifierBehaviour) {
  const classify = vi.fn<ScopeClassifier['classify']>(async () => {
    if (behaviour === 'hang') return new Promise<never>(() => {})
    if (behaviour === 'fail') throw new Error('openai responses 503')
    return { scope: 'background', confidence: 0.9, keep: ['amber bottle'], change: 'beach background', usage: { inputTokens: 800, outputTokens: 30 }, ...behaviour }
  })
  return { classifier: { tag: 'fake/luna', classify } satisfies ScopeClassifier, classify }
}

// A finished 4:5 work by `userId`, made the ordinary way, to edit.
export async function finishedWork(userId: string, store: ObjectStore, templateId: string, upload: (key: string, body: Uint8Array) => void) {
  const inputKey = newInputKey(userId, 'image/jpeg')
  upload(inputKey, await jpeg(1600, 2000))
  const view = await runGeneration(
    { db: serviceSupabase(), store, provider: fakeProvider().provider, track: vi.fn() },
    { userId, source: 'web', templateId, inputKey, aspectRatio: '4:5' },
  )
  return view.id
}
