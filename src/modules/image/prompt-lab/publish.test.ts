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
function setup(commit: RpcResult = { data: { id: 'dark-food', existing: false } }, styled = true) {
  const priv = createMemoryStore()
  const pub = createMemoryStore()
  priv.upload(`prompt-lab/outputs/${run}.png`, png, 'image/png')
  priv.upload('admin-tests/photos/p.jpg', png, 'image/png')
  priv.upload(`references/${asset}.webp`, png, 'image/webp')
  const source = { run: { output_key: `prompt-lab/outputs/${run}.png`, photo_key: 'admin-tests/photos/p.jpg', use_style_reference: styled,
    asset: { id: asset, width: 2000, height: 1500, created_at: '2026-11-10T00:00:00Z' } } }
  const rpc = vi.fn(async (name: string) => name === 'admin_prompt_lab_publish_source' ? { data: source, error: null } : { data: null, error: null, ...commit })
  const deps = { db: { rpc } as never, store: priv.store, assets: pub.store, assetsBaseUrl: base }
  return { deps, rpc, priv, pub }
}

describe('publish a prompt-lab result as a template draft', () => {
  it('writes covers and a resized private style image, then commits them without ever sending a prompt', async () => {
    const { deps, rpc, priv, pub } = setup()
    expect(await publishLabRun(deps, 'actor', request)).toEqual({ id: 'dark-food', existing: false })
    const args = rpc.mock.calls[1] as unknown as [string, Record<string, unknown>]
    expect(args[0]).toBe('admin_publish_prompt_lab_run')
    const assets = args[1].p_assets as { cover_before_url: string; cover_after_url: string; style_refs: { key: string; width: number }[] }
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

  it('removes only this attempt’s new objects after a known rollback, keeping a cover that already existed', async () => {
    const { deps, priv, pub } = setup({ error: { code: 'P0001', message: 'INVALID_CATEGORY' } })
    const first = setup()
    await publishLabRun(first.deps, 'actor', request)
    const kept = [...first.pub.objects.keys()].find(key => key.includes('/before-'))!
    pub.upload(kept, png, 'image/webp')
    await expect(publishLabRun(deps, 'actor', request)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect([...pub.objects.keys()]).toEqual([kept])
    expect([...priv.objects.keys()].some(key => key.startsWith('style-refs/'))).toBe(false)
  })

  it.each([
    [{ code: 'P0001', message: 'TEMPLATE_EXISTS' }, 'CONFLICT'],
    [{ code: '23505', message: 'duplicate key' }, 'INTERNAL'],
    [{ message: 'fetch failed' }, 'INTERNAL'],
  ])('never deletes when the id is taken or the commit outcome is unknown (%o)', async (error, code) => {
    const { deps, pub } = setup({ error }, false)
    await expect(publishLabRun(deps, 'actor', request)).rejects.toMatchObject({ code })
    expect(pub.objects.size).toBe(2)
  })

  it('cleans up and skips the commit when an object write fails', async () => {
    const { deps, rpc, pub, priv } = setup()
    priv.failPut.next = true
    await expect(publishLabRun(deps, 'actor', request)).rejects.toMatchObject({ code: 'INTERNAL' })
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(pub.objects.size).toBe(0)
  })

  it('discards its copies when another request published the same result under another id', async () => {
    const { deps, pub, priv } = setup({ data: { id: 'other', existing: true } })
    expect(await publishLabRun(deps, 'actor', request)).toEqual({ id: 'other', existing: true })
    expect(pub.objects.size).toBe(0)
    expect([...priv.objects.keys()].some(key => key.startsWith('style-refs/'))).toBe(false)
  })

  it('rejects reserved or malformed ids before any database call', async () => {
    const { deps, rpc } = setup()
    for (const id of ['edit', 'Bad_ID', '-x']) {
      await expect(publishLabRun(deps, 'actor', { ...request, template: { ...request.template, id } })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    }
    expect(rpc).not.toHaveBeenCalled()
  })
})
