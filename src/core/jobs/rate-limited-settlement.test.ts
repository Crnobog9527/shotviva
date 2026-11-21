import { expect, it, vi } from 'vitest'

import { classifyFailure } from './generation-failure'
import { laneOf, slotKind } from './generation-lane'
import { ProviderError, type GenerationProvider, type ProviderInput } from './provider'
import { settleProviderCall, type SettleDeps } from './settle-generation'
import type { JobCost } from './settlement'


const call: Omit<ProviderInput, 'signal'> = { prompt: 'test', images: [], aspectRatio: '1:1', resolution: '1k', quality: 'medium', params: {} }
const image = { bytes: new Uint8Array(), contentType: 'image/png' as const }

function fixture(provider: GenerationProvider, waits: number[] = [1, 1]) {
  const ledger = { id: 'fixture', source: 'admin_test', alerts: false, store: async () => [],
    confirm: async (_stored: string[], cost: JobCost) => cost, fail: vi.fn(async () => true) }
  const deps = { provider, providerTimeoutMs: 1_000, rateLimitRetryWaitsMs: waits } as unknown as SettleDeps
  return { run: () => settleProviderCall(deps, ledger, call), ledger }
}

it('retries a provider 429 within the deadline and settles the image once it goes through', async () => {
  const generate = vi.fn()
    .mockRejectedValueOnce(new ProviderError('rate_limited', 'HTTP 429'))
    .mockResolvedValueOnce(image)
  const { run, ledger } = fixture({ id: 'p', generate })
  await expect(run()).resolves.toBeDefined()
  expect(generate).toHaveBeenCalledTimes(2)
  expect(ledger.fail).not.toHaveBeenCalled()
})

it('refunds as RATE_LIMITED once the retries are used up', async () => {
  const generate = vi.fn(async () => { throw new ProviderError('rate_limited', 'HTTP 429') })
  const { run, ledger } = fixture({ id: 'p', generate })
  await expect(run()).rejects.toMatchObject({ code: 'RATE_LIMITED', refunded: true })
  expect(generate).toHaveBeenCalledTimes(3)
  expect(ledger.fail).toHaveBeenCalledWith('PROVIDER_RATE_LIMITED', expect.anything())
})

it('never retries other failures', async () => {
  const generate = vi.fn(async () => { throw new ProviderError('failed', 'HTTP 500') })
  const { run } = fixture({ id: 'p', generate })
  await expect(run()).rejects.toMatchObject({ code: 'GENERATION_FAILED' })
  expect(generate).toHaveBeenCalledTimes(1)
})

it('classifies a lasting provider 429 as RATE_LIMITED, not a failure', () => {
  expect(classifyFailure('provider', new ProviderError('rate_limited', 'x'))).toMatchObject({
    jobCode: 'PROVIDER_RATE_LIMITED', error: { code: 'RATE_LIMITED', status: 429 },
  })
})

it('puts every GPT image model in one lane and Seedream in another', () => {
  expect(laneOf('6f1c…/openai/gpt-image-2')).toBe('gpt')
  expect(laneOf('env/gpt-image-1')).toBe('gpt')
  expect(laneOf('a1/doubao-seedream-5-0-260128')).toBe('seedream')
  expect(laneOf('a1/google/gemini-image')).toBe('other')
  expect(slotKind(undefined)).toBe('single')
  expect(slotKind(30)).toBe('batch')
})
