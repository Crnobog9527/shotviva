import { randomUUID } from 'node:crypto'
import type { AdminProvider } from '@/core/providers'
import { describe, expect, it, vi } from 'vitest'
import { requestReverse, reverseEstimate } from './reverse-provider'

const row = { model: 'private-fixture', baseUrl: 'https://fixture.invalid', prices: { inputTextPerM: 2, outputPerM: 4, inputImagePerM: null } } as AdminProvider
const instruction = randomUUID(), draft = randomUUID(), privateImage = 'data:image/webp;base64,AA=='
function transportReply(status: string, text: string) {
  return vi.fn<typeof fetch>().mockResolvedValue(Response.json({ status,
    output: [{ content: [{ type: 'output_text', text }] }], usage: { input_tokens: 100, output_tokens: 20 },
  }))
}

describe('vision provider dispatch', () => {
  it('uses only the saved model and private instruction, with bounded output, and computes the receipt', async () => {
    const send = transportReply('completed', draft)
    const answer = await requestReverse(row, 'test', instruction, privateImage, send)
    expect(answer).toEqual({ prompt: draft, cost: 0.00028 })
    const [url, opts] = send.mock.calls[0]
    expect(url).toBe('https://fixture.invalid/responses')
    expect(JSON.parse(String(opts?.body))).toMatchObject({ model: row.model, store: false, instructions: instruction,
      input: [{ role: 'user', content: [{ type: 'input_image', image_url: privateImage }] }] })
    expect(reverseEstimate(row, instruction)).toBeGreaterThan(answer.cost!)
  })

  it('does not save incomplete text but accounts for billed usage', async () => {
    const answer = await requestReverse(row, 'test', instruction, privateImage, transportReply('incomplete', draft))
    expect(answer).toEqual({ prompt: null, cost: 0.00028 })
  })
})
