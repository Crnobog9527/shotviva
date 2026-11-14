import { expect, it, vi } from 'vitest'

import type { GenerationProvider, ProviderInput } from './provider'
import { settleProviderCall, type SettleDeps } from './settle-generation'
import type { JobCost } from './settlement'

const call: Omit<ProviderInput, 'signal'> = { prompt: 'test', images: [], aspectRatio: '1:1', resolution: '1k', quality: 'medium', params: {} }
function fixture(provider: GenerationProvider) {
  const ledger = { id: 'fixture', source: 'admin_test', alerts: false, store: async () => [],
    confirm: async (_stored: string[], cost: JobCost) => cost, fail: vi.fn(async () => true) }
  const deps = { provider, providerTimeoutMs: 20 } as SettleDeps
  return { run: () => settleProviderCall(deps, ledger, call), ledger }
}

it('a slow receipt lookup cannot turn an on-time image into a failed generation', async () => {
  const { run, ledger } = fixture({ id: 'fixture', generate: async () => ({
    bytes: new Uint8Array(), contentType: 'image/png', usage: { cost: null, generation_id: 'gen-test' },
  }), completeUsage: async usage => {
    await new Promise(resolve => setTimeout(resolve, 40))
    return { ...usage, cost: 0.018, is_byok: false }
  } })
  expect(await run()).toMatchObject({ costUsd: 0.01899 })
  expect(ledger.fail).not.toHaveBeenCalled()
})

it('keeps a submitted request pending when the local deadline fires before its receipt', async () => {
  const { run, ledger } = fixture({ id: 'fixture', generate: ({ noteUsage }) => {
    noteUsage?.({ cost: null })
    return new Promise(() => {})
  } })
  await expect(run()).rejects.toThrow()
  expect(ledger.fail).toHaveBeenCalledWith(expect.any(String), { usage: { cost: null }, costUsd: null })
})
