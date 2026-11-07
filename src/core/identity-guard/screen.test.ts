import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'

import type { ServerTrack } from '../analytics'
import type { IdentityJudge } from './judge'
import { IDENTITY_JUDGE_INSTRUCTIONS } from './question'
import { excerptOf } from './refuse'
import { screenIdentityText, userText } from './screen'

type Slot = { status: 'call'; id: number } | { status: 'cached'; identity_swap: boolean } | { status: 'limited' }

// record_identity_refusal answers `recorded` (or `error`); begin_identity_judge answers `slot`.
function fakeDb(error: { message: string } | null = null, recorded = true, slot: Slot = { status: 'call', id: 7 }) {
  const rpc = vi.fn(async (fn: string) => {
    if (fn === 'begin_identity_judge') return { data: slot, error: null }
    if (fn === 'finish_identity_judge') return { data: null, error: null }
    return { data: error ? null : recorded, error }
  })
  return { db: { rpc } as unknown as SupabaseClient, rpc }
}

const refusalCalls = (rpc: ReturnType<typeof fakeDb>['rpc']) => rpc.mock.calls.filter(([fn]) => fn === 'record_identity_refusal')

function judgeOf(behaviour: boolean | 'fail' | 'hang') {
  const judge = vi.fn<IdentityJudge['judge']>(async () => {
    if (behaviour === 'hang') return new Promise<never>(() => {})
    if (behaviour === 'fail') throw new Error('openai responses 503')
    return { identitySwap: behaviour, usage: { inputTokens: 420, outputTokens: 8 } }
  })
  return { identityJudge: { tag: 'fake/luna', judge } satisfies IdentityJudge, judge }
}

function setup(behaviour: boolean | 'fail' | 'hang' | null = false, rpcError: { message: string } | null = null, recorded = true, slot?: Slot) {
  const { db, rpc } = fakeDb(rpcError, recorded, slot)
  const track = vi.fn<ServerTrack>()
  const judge = behaviour === null ? null : judgeOf(behaviour)
  const deps = { db, track, identityJudge: judge?.identityJudge ?? null, identityJudgeTimeoutMs: 30 }
  const screen = (...texts: (string | undefined)[]) => screenIdentityText(deps, { userId: 'u1', entry: 'workspace', texts, locale: 'zh' })
  return { rpc, track, judge: judge?.judge, screen }
}

describe('screenIdentityText (ARCHITECTURE §5.1a)', () => {
  it('refuses a keyword hit without calling the model, records it and tracks it', async () => {
    const { rpc, track, judge, screen } = setup(false)
    await expect(screen('', '把他的脸换成第二张图的人')).rejects.toMatchObject({ code: 'IDENTITY_SWAP_REFUSED', status: 422 })
    expect(judge).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledWith('record_identity_refusal', {
      p_user_id: 'u1',
      p_entry: 'workspace',
      p_method: 'keyword',
      p_excerpt: '把他的脸换成第二张图的人',
      p_input_tokens: null,
      p_output_tokens: null,
    })
    expect(rpc).not.toHaveBeenCalledWith('begin_identity_judge', expect.anything())
    expect(track).toHaveBeenCalledWith('generate_refused', { reason: 'identity_swap', source: 'workspace' }, { distinctId: 'u1', locale: 'zh' })
  })

  it('asks the model with the words only and refuses when it says identity_swap', async () => {
    const { rpc, judge, screen } = setup(true)
    await expect(screen('Spring sale', 'make her look like Taylor Swift')).rejects.toMatchObject({ code: 'IDENTITY_SWAP_REFUSED' })
    expect(judge).toHaveBeenCalledWith(expect.objectContaining({ text: 'Spring sale\nmake her look like Taylor Swift', instructions: IDENTITY_JUDGE_INSTRUCTIONS }))
    // The refusing call's tokens go on the row, since no job carries them.
    expect(rpc).toHaveBeenCalledWith('record_identity_refusal', expect.objectContaining({ p_method: 'model', p_input_tokens: 420, p_output_tokens: 8 }))
    expect(rpc).toHaveBeenCalledWith('finish_identity_judge', { p_id: 7, p_identity_swap: true })
  })

  it('lets an allowed request through with the call’s tokens for the job’s cost', async () => {
    const { rpc, track, screen } = setup(false)
    expect(await screen('让他笑一下')).toEqual({ usage: { inputTokens: 420, outputTokens: 8 } })
    expect(rpc).toHaveBeenCalledWith('begin_identity_judge', expect.objectContaining({ p_user_id: 'u1', p_text_hash: expect.stringMatching(/^[0-9a-f]{64}$/), p_per_hour: 30 }))
    expect(rpc).toHaveBeenCalledWith('finish_identity_judge', { p_id: 7, p_identity_swap: false })
    expect(refusalCalls(rpc)).toEqual([])
    expect(track).not.toHaveBeenCalled()
  })

  it('fails open when the model errors, hangs past the deadline or is not switched on', async () => {
    for (const behaviour of ['fail', 'hang', null] as const) {
      const { rpc, screen } = setup(behaviour)
      expect(await screen('make her look like Taylor Swift')).toEqual({ usage: null })
      expect(refusalCalls(rpc)).toEqual([])
    }
  })

  it('makes no call when the user typed nothing', async () => {
    const { judge, screen } = setup(true)
    expect(await screen('', '   ', undefined)).toEqual({ usage: null })
    expect(judge).not.toHaveBeenCalled()
  })

  it('still refuses (and tracks) when the record cannot be written', async () => {
    const { track, screen } = setup(false, { message: 'connection reset' })
    await expect(screen('face swap us')).rejects.toMatchObject({ code: 'IDENTITY_SWAP_REFUSED' })
    expect(track).toHaveBeenCalledTimes(1)
  })

  it('refuses the other photos of a batch without a second event', async () => {
    const { track, screen } = setup(false, null, false)
    await expect(screen('face swap us')).rejects.toMatchObject({ code: 'IDENTITY_SWAP_REFUSED' })
    expect(track).not.toHaveBeenCalled()
  })
})

describe('screenIdentityText: hourly calls and the 10-minute reuse (judge-slots.ts)', () => {
  it('reuses a verdict from the last 10 minutes without calling, and refuses on a cached refusal', async () => {
    const allowed = setup(true, null, true, { status: 'cached', identity_swap: false })
    expect(await allowed.screen('让他笑一下')).toEqual({ usage: null })
    expect(allowed.judge).not.toHaveBeenCalled()
    const refused = setup(false, null, true, { status: 'cached', identity_swap: true })
    await expect(refused.screen('make her look like Taylor Swift')).rejects.toMatchObject({ code: 'IDENTITY_SWAP_REFUSED' })
    expect(refused.judge).not.toHaveBeenCalled()
  })

  it('answers RATE_LIMITED past the hourly calls, before any model call', async () => {
    const { judge, screen } = setup(false, null, true, { status: 'limited' })
    await expect(screen('换成夜景')).rejects.toMatchObject({ code: 'RATE_LIMITED', status: 429 })
    expect(judge).not.toHaveBeenCalled()
  })
})

describe('userText and excerptOf', () => {
  it('joins the non-empty fields one per line', () => {
    expect(userText([' 标题 ', '', null, undefined, '换成夜景'])).toBe('标题\n换成夜景')
  })

  it('keeps 200 characters, never half an emoji', () => {
    expect(Array.from(excerptOf('😀'.repeat(250)))).toHaveLength(200)
    expect(excerptOf('  short  ')).toBe('short')
  })
})
