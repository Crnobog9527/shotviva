import { describe, expect, it, vi } from 'vitest'

import { IDENTITY_PROMPT_VERSION, type IdentityJudge } from '@/core/identity-guard'

import { summarize } from '../identity-dry-run-ui/summary'
import { toRecording } from './recording'
import { dryRunIdentityScreen } from './run'

const judge = (answer: (text: string) => boolean | Error): IdentityJudge & { judge: ReturnType<typeof vi.fn> } => ({
  tag: 'row-1/gpt-6-luna',
  prices: { inputTextPerM: 0.1, inputImagePerM: null, outputPerM: 0.5 },
  judge: vi.fn<IdentityJudge['judge']>(async ({ text }) => {
    const verdict = answer(text)
    if (verdict instanceof Error) throw verdict
    return { identitySwap: verdict, usage: { inputTokens: 400, outputTokens: 6 } }
  }),
})

const now = () => new Date('2026-11-08T04:00:00Z')

describe('admin face-swap dry run (T81)', () => {
  it('runs every line through the model, with latency, tokens and the prompt version', async () => {
    const fake = judge((text) => text.includes('Taylor'))
    const result = await dryRunIdentityScreen(fake, { text: '让他笑一下\n\n  make her look like Taylor Swift \nface swap us' }, now)
    if (!result.ok) throw new Error('expected rows')
    expect(result).toMatchObject({ model: 'gpt-6-luna', promptVersion: IDENTITY_PROMPT_VERSION })
    expect(result.rows.map((row) => [row.text, row.identitySwap])).toEqual([
      ['让他笑一下', false],
      ['make her look like Taylor Swift', true],
      // No keyword list any more: only the model decides.
      ['face swap us', false],
    ])
    expect(result.rows[0]).toMatchObject({ inputTokens: 400, outputTokens: 6, error: null })
    expect(fake.judge).toHaveBeenCalledTimes(3)
  })

  it('refuses more than 50 lines, a line over 300 characters, and nothing at all, before any call', async () => {
    const fake = judge(() => false)
    expect(await dryRunIdentityScreen(fake, { text: Array.from({ length: 51 }, (_, i) => `line ${i}`).join('\n') })).toEqual({ ok: false, reason: 'too_many_lines' })
    expect(await dryRunIdentityScreen(fake, { text: 'x'.repeat(301) })).toEqual({ ok: false, reason: 'line_too_long' })
    expect(await dryRunIdentityScreen(fake, { text: ' \n ' })).toEqual({ ok: false, reason: 'empty' })
    expect(await dryRunIdentityScreen(fake, { text: 5 })).toMatchObject({ ok: false })
    expect(fake.judge).not.toHaveBeenCalled()
  })

  it('shows a failed call or no provider as an error', async () => {
    const failed = await dryRunIdentityScreen(judge(() => new Error('openai responses 503')), { text: '换成夜景' }, now)
    expect(failed.ok && failed.rows[0]).toMatchObject({ identitySwap: null, error: 'openai responses 503' })
    const none = await dryRunIdentityScreen(null, { text: 'deepfake my boss' }, now)
    expect(none.ok && none).toMatchObject({ model: null, rows: [{ identitySwap: null, error: 'no decision provider is on' }] })
  })

  it('summarises latency, tokens and cost, and exports the recording JSON', async () => {
    const result = await dryRunIdentityScreen(judge((text) => text === 'b'), { text: 'a\nb' }, now)
    if (!result.ok) throw new Error('expected rows')
    const summary = summarize(result.rows, result.prices)
    expect(summary).toMatchObject({ answered: 2, refused: 1, inputTokens: 400, outputTokens: 6 })
    expect(summary.costUsd).toBeCloseTo(0.000043, 9)
    expect(toRecording(result)).toEqual({
      model: 'gpt-6-luna',
      promptVersion: IDENTITY_PROMPT_VERSION,
      recordedAt: '2026-11-08T04:00:00.000Z',
      answers: {
        a: { identitySwap: false, ms: expect.any(Number), inputTokens: 400, outputTokens: 6 },
        b: { identitySwap: true, ms: expect.any(Number), inputTokens: 400, outputTokens: 6 },
      },
    })
  })
})
