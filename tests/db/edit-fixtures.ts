import type { Client } from 'pg'
import { vi } from 'vitest'

import type { ServerTrack } from '@/core/analytics'
import { runGeneration } from '@/core/jobs'
import { newInputKey, type ObjectStore } from '@/core/storage'
import { runEdit, type ClassifierAnswer, type EditDeps, type ScopeClassifier } from '@/modules/image'

import { jpeg } from '../fakes/images'
import { createMemoryStore } from '../fakes/memory-store'
import { fakeProvider, type FakeBehaviour } from './generation-fixtures'
import { createUser, type TestProfile } from './helpers'
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
  reframe: 'C-REFRAME',
}
export const TEST_WRAPPER = 'WRAPPER-EDIT'

type Saved = { isActive: boolean; body: string; params: unknown }

// Publishes the seeded `edit` template with the markers above; restore() puts the seed back.
// Test files run in parallel and more than one publishes the built-in edit template; one file's
// restore would unpublish it under another mid-run. A session advisory lock held on the file's
// own connection from publish to restore runs those files one after another.
const EDIT_TEMPLATE_LOCK = 4_710_047

export async function publishEditTemplate(db: Client): Promise<() => Promise<void>> {
  await db.query('select pg_advisory_lock($1)', [EDIT_TEMPLATE_LOCK])
  const { rows } = await db.query<{ is_active: boolean; body: string; model_params: unknown }>(
    `select t.is_active, p.body, p.model_params from public.templates t
       join public.template_prompts p on p.template_id = t.id where t.id = 'edit'`,
  )
  const saved: Saved = { isActive: rows[0]!.is_active, body: rows[0]!.body, params: rows[0]!.model_params }
  await setEditTemplate(db, true, TEST_WRAPPER, TEST_EDIT_PARAMS)
  return async () => {
    await setEditTemplate(db, saved.isActive, saved.body, saved.params)
    await db.query('select pg_advisory_unlock($1)', [EDIT_TEMPLATE_LOCK])
  }
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
  const classifier: ScopeClassifier = { tag: 'fake/luna', classify }
  return { classifier, classify }
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

export type EditOptions = { classifier?: ClassifierBehaviour | null; provider?: FakeBehaviour; profile?: TestProfile }

// A user with one finished 4:5 work (Standard, 1 credit) and `profile` credits left after it.
export async function editSetup(db: Client, templateId: string, { classifier = {}, provider = 'ok', profile = { credits: 10 } }: EditOptions = {}) {
  const userId = await createUser(db, { credits: (profile.credits ?? 0) + 1, freeCredits: profile.freeCredits })
  const r2 = createMemoryStore()
  const sourceId = await finishedWork(userId, r2.store, templateId, (key, body) => r2.upload(key, body, 'image/jpeg'))
  const fake = fakeProvider(provider)
  const decision = classifier === null ? null : fakeClassifier(classifier)
  const track = vi.fn<ServerTrack>()
  const deps: EditDeps = {
    db: serviceSupabase(),
    store: r2.store,
    provider: fake.provider,
    classifier: decision?.classifier ?? null,
    providerTimeoutMs: 200,
    classifierTimeoutMs: 50,
    track,
  }
  const edit = (instruction = 'Put it on a beach', extra: { jobId?: string; resolution?: '2k'; aspect?: '16:9' | '4:5' } = {}) =>
    runEdit(deps, { userId, sourceJobId: sourceId, instruction, ...extra })
  return { userId, sourceId, r2, fake, decision, deps, track, edit }
}

export async function editJobRow(db: Client, jobId: string) {
  const { rows } = await db.query<{ template_id: string; parent_job_id: string | null; inputs: Record<string, unknown>; credits_cost: number }>(
    'select template_id, parent_job_id, inputs, credits_cost from public.generation_jobs where id = $1',
    [jobId],
  )
  return rows[0]!
}
