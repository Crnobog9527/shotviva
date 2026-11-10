import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryStore } from '../../../../tests/fakes/memory-store'

const { provider, request, instruction, preview } = vi.hoisted(() => ({
  provider: vi.fn(), request: vi.fn(), instruction: crypto.randomUUID(), preview: vi.fn().mockResolvedValue('private-image'),
}))
vi.mock('@/core/providers', async original => ({ ...await original<typeof import('@/core/providers')>(), findProvider: provider, readProviderKey: async () => 'test-key' }))
vi.mock('./vision-capability', () => ({ assertPromptLabVisionCapability: vi.fn() }))
vi.mock('./reverse-provider', () => ({ reverseEstimate: () => 0.03, visionPreview: preview, requestReverse: request }))
const { reverseLabPrompt } = await import('./reverse')

describe('reverse prompt operations', () => {
  const model = randomUUID(), asset = randomUUID(), sessionId = randomUUID(), requestId = randomUUID()
  const rpc = vi.fn(), actor = randomUUID()
  const from = (table: string) => ({ select: () => ({ eq: () => ({ maybeSingle: () => ({
    data: table === 'system_settings' ? { value: { model, instruction } } : { asset_id: asset },
  }) }) }) })
  const db = { from, rpc } as unknown as SupabaseClient
  const { store, upload } = createMemoryStore()
  beforeEach(() => { rpc.mockReset(); request.mockReset(); provider.mockResolvedValue({ id: model, model: 'test' }); upload(`references/${asset}.webp`, Uint8Array.of(1), 'image/webp') })

  it('never calls the supplier on budget refusal or replay', async () => {
    rpc.mockResolvedValueOnce({ error: { message: 'TEST_BUDGET_EXCEEDED' } })
    await expect(reverseLabPrompt({ db, store }, actor, { sessionId, requestId })).rejects.toMatchObject({ code: 'TEST_BUDGET_EXCEEDED' })
    const version = randomUUID()
    rpc.mockResolvedValueOnce({ data: { claimed: false, status: 'succeeded', version_id: version } })
    expect(await reverseLabPrompt({ db, store }, actor, { sessionId, requestId })).toEqual({ status: 'succeeded', versionId: version })
    expect(request).not.toHaveBeenCalled()
  })

  it('keeps the submitted estimate when the remote reply is lost, without copying its error to the client or DB', async () => {
    rpc.mockResolvedValueOnce({ data: { claimed: true, status: 'running', version_id: null } })
      .mockResolvedValueOnce({ data: { status: 'failed', version_id: null } })
    request.mockRejectedValue(new Error(instruction))
    expect(await reverseLabPrompt({ db, store }, actor, { sessionId, requestId })).toEqual({ status: 'failed', versionId: null })
    expect(rpc).toHaveBeenLastCalledWith('admin_finish_prompt_lab_reverse', expect.objectContaining({
      p_submitted: true, p_error_code: 'REVERSE_FAILED', p_cost_usd: null, p_prompt: null,
    }))
  })
})
