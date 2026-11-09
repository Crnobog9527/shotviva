import { expect, it, vi } from 'vitest'

import { jobCostUsd } from '@/core/jobs/job-cost'
import { completeReceipt, reportedUsage } from './openrouter-receipt'

const source = { model: 'vendor/image', baseUrl: 'https://relay.example/v1', apiKey: 'fixture' }
const gen = 'gen-123-abcd'
function read(body: unknown, data: unknown) {
  const fetch = vi.fn(async () => Response.json({ data }))
  return { fetch, receipt: completeReceipt(reportedUsage(body, new Headers({ 'x-generation-id': gen })), { ...source, fetch }) }
}

it('recovers the missing charge from the matching authenticated generation receipt', async () => {
  const { fetch, receipt } = read({ usage: { completion_tokens: 0 } }, { id: gen, total_cost: 0.018, is_byok: false })
  const usage = await receipt
  expect(usage).toMatchObject({ cost: 0.018, cost_source: 'generation', generation_id: gen })
  expect(jobCostUsd(usage, null)).toBe(0.01899)
  expect(fetch).toHaveBeenCalledExactlyOnceWith(source.baseUrl + '/generation?id=' + gen,
    expect.objectContaining({ method: 'GET', redirect: 'error', headers: { Authorization: 'Bearer fixture' } }))
})

it('does not assign another request’s charge or interpret a BYOK fee as total cost', async () => {
  const mismatch = await read({}, { id: 'gen-other', total_cost: 123, is_byok: false }).receipt
  expect(mismatch).toMatchObject({ cost: null, generation_id: gen })
  const byok = await read({ usage: { cost: 0 } }, { id: gen, total_cost: 0, is_byok: true, upstream_inference_cost: 0.02 }).receipt
  expect(byok).toMatchObject({ is_byok: true, upstream_inference_cost: 0.02 })
  expect(jobCostUsd(byok, null)).toBeNull()
})

it('uses the response without another call when it supplies the charge and billing mode', async () => {
  const { fetch, receipt } = read({ usage: { cost: 0.018, is_byok: false } }, {})
  expect(await receipt).toMatchObject({ cost: 0.018, generation_id: gen })
  expect(fetch).not.toHaveBeenCalled()
})

it('ignores an invalid ID and preserves an unpriced response as pending', async () => {
  const fetch = vi.fn()
  const usage = await completeReceipt(reportedUsage({ id: 'https://elsewhere.test/', usage: { cost: null } }, new Headers()), { ...source, fetch })
  expect(usage).toEqual({ cost: null })
  expect(fetch).not.toHaveBeenCalled()
})
