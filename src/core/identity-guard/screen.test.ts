import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'

import type { ServerTrack } from '../analytics'
import type { IdentityJudge } from './judge'
import { IDENTITY_JUDGE_INSTRUCTIONS } from './question'
import { excerptOf } from './refuse'
import { screenIdentityText, userText } from './screen'

function fakeDb(error: { message: string } | null = null, recorded = true) {
  const rpc = vi.fn(async () => ({ data: error ? null : recorded, error }))
  return { db: { rpc } as unknown as SupabaseClient, rpc }
}

function judgeOf(behaviour: boolean | 'fail' | 'hang') {
  const judge = vi.fn<IdentityJudge['judge']>(async () => {
    if (behaviour === 'hang') return new Promise<never>(() => {})
    if (behaviour === 'fail') throw new Error('openai responses 503')
    return { identitySwap: behaviour, usage: { inputTokens: 420, outputTokens: 8 } }
  })
  return { identityJudge: { tag: 'fake/luna', judge } satisfies IdentityJudge, judge }
}

function setup(behaviour: boolean | 'fail' | 'hang' | null = false, rpcError: { message: string } | null = null, recorded = true) {
  const { db, rpc } = fakeDb(rpcError, recorded)
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
    expect(rpc).toHaveBeenCalledWith('record_identity_refusal', { p_user_id: 'u1', p_entry: 'workspace', p_method: 'keyword', p_excerpt: '把他的脸换成第二张图的人' })
    expect(track).toHaveBeenCalledWith('generate_refused', { reason: 'identity_swap', source: 'workspace' }, { distinctId: 'u1', locale: 'zh' })
  })

  it('asks the model with the words only and refuses when it says identity_swap', async () => {
    const { rpc, judge, screen } = setup(true)
    await expect(screen('Spring sale', 'make her look like Taylor Swift')).rejects.toMatchObject({ code: 'IDENTITY_SWAP_REFUSED' })
    expect(judge).toHaveBeenCalledWith(expect.objectContaining({ text: 'Spring sale\nmake her look like Taylor Swift', instructions: IDENTITY_JUDGE_INSTRUCTIONS }))
    expect(rpc).toHaveBeenCalledWith('record_identity_refusal', expect.objectContaining({ p_method: 'model' }))
  })

  it('lets an allowed request through with the call’s tokens for the job’s cost', async () => {
    const { rpc, track, screen } = setup(false)
    expect(await screen('让他笑一下')).toEqual({ usage: { inputTokens: 420, outputTokens: 8 } })
    expect(rpc).not.toHaveBeenCalled()
    expect(track).not.toHaveBeenCalled()
  })

  it('fails open when the model errors, hangs past the deadline or is not switched on', async () => {
    for (const behaviour of ['fail', 'hang', null] as const) {
      const { rpc, screen } = setup(behaviour)
      expect(await screen('make her look like Taylor Swift')).toEqual({ usage: null })
      expect(rpc).not.toHaveBeenCalled()
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

describe('userText and excerptOf', () => {
  it('joins the non-empty fields one per line', () => {
    expect(userText([' 标题 ', '', null, undefined, '换成夜景'])).toBe('标题\n换成夜景')
  })

  it('keeps 200 characters, never half an emoji', () => {
    expect(Array.from(excerptOf('😀'.repeat(250)))).toHaveLength(200)
    expect(excerptOf('  short  ')).toBe('short')
  })
})
