import sharp from 'sharp'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createMemoryStore } from '../../../../tests/fakes/memory-store'
import { publishLabRun } from './publish'

const base = 'https://assets.example.test'
const run = '0f1e2d3c-4b5a-4678-9abc-def012345678'
const asset = '11111111-2222-4333-8444-555555555555'
const request = { runId: run, template: { id: 'dark-food', name: 'Dark food', nameZh: null, category: 'food' } }
let png: Uint8Array
beforeAll(async () => {
  png = new Uint8Array(await sharp({ create: { width: 40, height: 30, channels: 3, background: '#335' } }).png().toBuffer())
})

type RpcResult = { data?: unknown; error?: { code?: string; message: string } }
type Holder = Record<string, unknown> | null
function setup(commit: RpcResult = { data: { id: 'dark-food', existing: false } }, styled = true) {
  const priv = createMemoryStore()
  const pub = createMemoryStore()
  priv.upload(`prompt-lab/outputs/${run}.png`, png, 'image/png')
  priv.upload('admin-tests/photos/p.jpg', png, 'image/png')
  priv.upload(`references/${asset}.webp`, png, 'image/webp')
  const source = { run: { output_key: `prompt-lab/outputs/${run}.png`, photo_key: 'admin-tests/photos/p.jpg', use_style_reference: styled,
    asset: { id: asset, width: 2000, height: 1500, created_at: '2026-11-10T00:00:00Z' } } }
  const rpc = vi.fn(async (name: string) => name === 'admin_prompt_lab_publish_source' ? { data: source, error: null } : { data: null, error: null, ...commit })
  // The template that holds the id when cleanup looks (none by default).
  const held = { row: null as Holder, error: null as unknown }
  const from = vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: held.row, error: held.error }) }) }) }))
  const deps = { db: { rpc, from } as never, store: priv.store, assets: pub.store, assetsBaseUrl: base }
  return { deps, rpc, priv, pub, held }
}
const styleKeys = (priv: ReturnType<typeof createMemoryStore>) => [...priv.objects.keys()].filter(key => key.startsWith('style-refs/'))
type CommitArgs = { p_assets: { cover_before_url: string; cover_after_url: string; style_refs: { key: string; width: number }[] } }
const commitArgs = (rpc: ReturnType<typeof setup>['rpc']) => (rpc.mock.calls[1] as unknown as [string, CommitArgs])[1]

describe('publish a prompt-lab result: success and retries', () => {
  it('writes covers and a resized private style image, then commits them without ever sending a prompt', async () => {
    const { deps, rpc, priv, pub } = setup()
    expect(await publishLabRun(deps, 'actor', request)).toEqual({ id: 'dark-food', existing: false })
    expect(rpc.mock.calls[1]![0]).toBe('admin_publish_prompt_lab_run')
    const assets = commitArgs(rpc).p_assets
    expect(assets.cover_after_url).toMatch(/^https:\/\/assets\.example\.test\/covers\/dark-food\/after-[0-9a-f]{16}\.webp$/)
    expect(assets.cover_before_url).toMatch(/\/covers\/dark-food\/before-[0-9a-f]{16}\.webp$/)
    expect(assets.style_refs[0]!.key).toMatch(/^style-refs\/dark-food\/[0-9a-f-]{36}\.webp$/)
    expect(assets.style_refs[0]!.width).toBeLessThanOrEqual(1536)
    expect(priv.objects.has(assets.style_refs[0]!.key)).toBe(true)
    expect([...pub.objects.keys()].every(key => key.startsWith('covers/dark-food/'))).toBe(true)
    expect(JSON.stringify(rpc.mock.calls)).not.toMatch(/prompt"|body/)
  })

  it('returns the first draft on a retry without copying anything', async () => {
    const { deps, rpc, pub } = setup()
    rpc.mockImplementationOnce(async () => ({ data: { existing: { id: 'first' } }, error: null }))
    expect(await publishLabRun(deps, 'actor', request)).toEqual({ id: 'first', existing: true })
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(pub.objects.size).toBe(0)
  })

  it('discards its copies when another request published the same result first', async () => {
    const { deps, pub, priv } = setup({ data: { id: 'other', existing: true } })
    expect(await publishLabRun(deps, 'actor', request)).toEqual({ id: 'other', existing: true })
    expect(pub.objects.size).toBe(0)
    expect(styleKeys(priv)).toEqual([])
  })

  it('rejects reserved or malformed ids before any database call', async () => {
    const { deps, rpc } = setup()
    for (const id of ['edit', 'Bad_ID', '-x']) {
      await expect(publishLabRun(deps, 'actor', { ...request, template: { ...request.template, id } })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    }
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('publish a prompt-lab result: cleanup after a failure', () => {
  it('removes only this attempt’s new objects after a known rollback, keeping a cover that already existed', async () => {
    const { deps, priv, pub } = setup({ error: { code: 'P0001', message: 'INVALID_CATEGORY' } })
    const first = setup()
    await publishLabRun(first.deps, 'actor', request)
    const kept = [...first.pub.objects.keys()].find(key => key.includes('/before-'))!
    pub.upload(kept, png, 'image/webp')
    await expect(publishLabRun(deps, 'actor', request)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect([...pub.objects.keys()]).toEqual([kept])
    expect(styleKeys(priv)).toEqual([])
  })

  it.each([
    [{ code: 'P0001', message: 'TEMPLATE_EXISTS' }, 'CONFLICT'],
    [{ code: '23505', message: 'duplicate key' }, 'INTERNAL'],
    [{ code: 'P0001', message: 'RUN_NOT_PUBLISHABLE' }, 'CONFLICT'],
  ])('keeps a cover a committed template under the same id uses, drops the rest (%o)', async (error, code) => {
    const { deps, pub, priv, held } = setup({ error })
    const probe = setup()
    await publishLabRun(probe.deps, 'actor', request)
    const before = commitArgs(probe.rpc).p_assets.cover_before_url
    held.row = { cover_before_url: before, cover_after_url: `${base}/covers/dark-food/after-${'9'.repeat(16)}.webp`,
      cover_video_url: null, cover_poster_url: null, cover_locales: {}, template_prompts: { style_refs: [] } }
    await expect(publishLabRun(deps, 'actor', request)).rejects.toMatchObject({ code })
    expect([...pub.objects.keys()]).toEqual([before.slice(base.length + 1)])
    expect(styleKeys(priv)).toEqual([])
  })

  it('keeps everything when the outcome is unknown and no template is visible yet, or the check itself fails', async () => {
    for (const failRead of [false, true]) {
      const { deps, pub, priv, held } = setup({ error: { message: 'fetch failed' } })
      if (failRead) held.error = { message: 'down' }
      await expect(publishLabRun(deps, 'actor', request)).rejects.toMatchObject({ code: 'INTERNAL' })
      expect(pub.objects.size).toBe(2)
      expect(styleKeys(priv)).toHaveLength(1)
    }
  })

  it('cleans up and skips the commit when an object write fails', async () => {
    const { deps, rpc, pub, priv } = setup()
    priv.failPut.next = true
    await expect(publishLabRun(deps, 'actor', request)).rejects.toMatchObject({ code: 'INTERNAL' })
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(pub.objects.size).toBe(0)
  })
})
