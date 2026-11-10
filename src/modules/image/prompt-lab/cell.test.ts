import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { sniffImageType } from '@/core/storage'
import { createMemoryStore } from '../../../../tests/fakes/memory-store'
import { jpeg } from '../../../../tests/fakes/images'

const { route } = vi.hoisted(() => ({ route: vi.fn() }))
vi.mock('./image-route', () => ({ labImageRoute: route }))
const { executeLabCell } = await import('./cell')

describe('matrix cell execution', () => {
  const id = randomUUID(), asset = randomUUID(), model = randomUUID() + '/local-test'
  const rpc = vi.fn(), one = vi.fn(), generate = vi.fn()
  const db = { rpc, from: () => ({ select: () => ({ eq: () => ({ single: one, maybeSingle: one }) }) }) } as unknown as SupabaseClient
  const row = { model, resolution: '1k', quality: 'medium', use_style_reference: true, estimate_usd: 0.04, status: 'running',
    admin_test_photos: { object_key: 'private/photo' }, prompt_lab_versions: { version_no: 2, prompt: randomUUID() },
    prompt_lab_sessions: { reference_assets: { id: asset, width: 16, height: 16, created_at: '2026-11-11T00:00:00Z' } } }
  beforeEach(() => {
    vi.resetAllMocks()
    route.mockResolvedValue({ provider: { id: model, generate, maxReferences: 3, prices: { inputTextPerM: 1, inputImagePerM: 1, outputPerM: 2 } },
      estimate: 0.04, aspectRatio: 'original' })
  })

  it('does not read private images or call the provider when another request claimed the cell', async () => {
    const { store } = createMemoryStore()
    rpc.mockResolvedValue({ data: false })
    one.mockResolvedValue({ data: { status: 'running' } })
    expect(await executeLabCell({ db, store }, 'actor', { runId: id })).toEqual({ id, status: 'running' })
    expect(route).not.toHaveBeenCalled()
    expect(generate).not.toHaveBeenCalled()
  })

  it('uses the selected version and photo-first T97 ordering, then settles reported usage in the shared budget', async () => {
    const { store, upload, objects } = createMemoryStore()
    upload('private/photo', await jpeg(8, 8), 'image/jpeg')
    upload(`references/${asset}.webp`, Uint8Array.of(10), 'image/webp')
    rpc.mockResolvedValueOnce({ data: true }).mockResolvedValue({ data: null })
    one.mockResolvedValue({ data: row })
    const usage = { input_text_tokens: 100, input_image_tokens: 50, output_tokens: 25 }
    generate.mockResolvedValue({ bytes: await jpeg(16, 16), contentType: 'image/png', usage })
    expect(await executeLabCell({ db, store }, 'actor', { runId: id })).toEqual({ id, status: 'succeeded' })
    expect(generate.mock.calls[0][0]).toMatchObject({ prompt: row.prompt_lab_versions.prompt, photoCount: 1,
      images: [{ contentType: 'image/jpeg' }, { contentType: 'image/webp' }], resolution: '1k', quality: 'medium' })
    const key = `prompt-lab/outputs/${id}.png`
    expect(sniffImageType(objects.get(key)!.body)).toBe('image/png')
    expect(rpc).toHaveBeenLastCalledWith('admin_finish_prompt_lab_run', expect.objectContaining({
      p_run_id: id, p_status: 'succeeded', p_output_key: key, p_provider_usage: usage, p_cost_usd: 0.0002,
    }))
  })

  it('releases unsubmitted cells whose provider or price changed since reservation', async () => {
    const { store } = createMemoryStore()
    rpc.mockResolvedValueOnce({ data: true }).mockResolvedValue({ data: null })
    one.mockResolvedValue({ data: { ...row, estimate_usd: 0.03 } })
    expect((await executeLabCell({ db, store }, 'actor', { runId: id })).status).toBe('failed')
    expect(generate).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenLastCalledWith('admin_finish_prompt_lab_run', expect.objectContaining({ p_error_code: 'PREPARE_FAILED', p_cost_usd: null }))
  })
})
