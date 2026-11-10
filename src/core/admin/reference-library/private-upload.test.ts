import { createHash, randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { describe, expect, it, vi } from 'vitest'

import { createMemoryStore } from '../../../../tests/fakes/memory-store'
import { finishReference, stageReference } from './private-upload'
import { readReferenceUpload } from './validate-object'

const actor = randomUUID()
const categoryId = 'test'
const webp = (width = 10) => sharp({ create: { width, height: 10, channels: 3, background: 'white' } }).webp().toBuffer()
const describeFile = (body: Uint8Array) => ({ size: body.length, sha256: createHash('sha256').update(body).digest('hex'), categoryId })

function database(existing: { id: string; status: string } | null = null) {
  const lookup = vi.fn().mockResolvedValue({ data: existing })
  const from = vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle: lookup }) }) }))
  const rpc = vi.fn().mockImplementation(async (fn, params) => fn === 'admin_register_reference_asset'
    ? { data: { id: params.p_asset.id, status: 'active', duplicate: false } }
    : { data: null })
  return { client: { rpc, from } as unknown as SupabaseClient, rpc, from }
}

async function stage() {
  const db = database()
  const memory = createMemoryStore()
  const body = await webp()
  const payload = describeFile(body)
  const upload = await stageReference(db.client, memory.store, actor, payload)
  if (!('uploadId' in upload)) throw new Error('missing staging ticket')
  const staged = `uploads-admin/references/${actor}/${upload.uploadId}.webp`
  memory.upload(staged, body, 'image/webp')
  return { db, memory, body, staged, input: { ...payload, uploadId: upload.uploadId } }
}

describe('private reference upload', () => {
  it('returns an archived duplicate without allocating an upload or restoring it', async () => {
    const id = randomUUID()
    const db = database({ id, status: 'archived' })
    const { store } = createMemoryStore()
    const sign = vi.spyOn(store, 'presignPut')
    expect(await stageReference(db.client, store, actor, describeFile(await webp()))).toEqual({ id, status: 'archived', duplicate: true })
    expect(sign).not.toHaveBeenCalled()
  })

  it('checks bytes, uploads the verified WebP under a leased key and removes staging', async () => {
    const { db, memory, input, staged, body } = await stage()
    const result = await finishReference(db.client, memory.store, actor, input)
    expect(db.rpc.mock.calls.map(([name]) => name)).toEqual(['admin_reserve_reference_upload', 'admin_register_reference_asset'])
    expect(db.rpc.mock.calls[1][1].p_asset).toMatchObject({ id: result.id, bytes: body.length, sha256: input.sha256, width: 10, height: 10 })
    expect(memory.objects.has(staged)).toBe(false)
    expect(memory.objects.get(`references/${result.id}.webp`)?.body).toEqual(body)
  })

  it('removes just the losing key when another upload wins the same digest', async () => {
    const { db, memory, input, body } = await stage()
    const winner = randomUUID()
    memory.upload(`references/${winner}.webp`, body, 'image/webp')
    db.rpc.mockResolvedValueOnce({ data: null }).mockResolvedValueOnce({ data: { id: winner, status: 'active', duplicate: true } })
    expect((await finishReference(db.client, memory.store, actor, input)).id).toBe(winner)
    const candidate = db.rpc.mock.calls[0][1].p_id
    expect(db.rpc).toHaveBeenCalledWith('admin_ack_reference_deletions', { p_actor: actor, p_keys: [`references/${candidate}.webp`] })
    expect([...memory.objects.keys()]).toEqual([`references/${winner}.webp`])
  })

  it('never removes the candidate on ambiguous database acknowledgement', async () => {
    const { db, memory, input, staged } = await stage()
    db.rpc.mockResolvedValueOnce({ data: null }).mockRejectedValueOnce(new Error('lost response'))
    await expect(finishReference(db.client, memory.store, actor, input)).rejects.toThrow()
    const candidateId = db.rpc.mock.calls[0][1].p_id
    expect(memory.objects.has(`references/${candidateId}.webp`)).toBe(true)
    expect(memory.objects.has(staged)).toBe(false)
  })

  it('refuses a staging key owned by a different administrator', async () => {
    const { db, memory, input, staged } = await stage()
    await expect(finishReference(db.client, memory.store, randomUUID(), input)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(db.rpc).not.toHaveBeenCalled()
    expect(memory.objects.has(staged)).toBe(true)
  })
})

describe('reference image validation', () => {
  it('rejects a renamed file, an oversized long edge, corrupt pixels and a false hash', async () => {
    const { store, upload } = createMemoryStore()
    const bytes = await webp()
    const renamed = Buffer.from('renamed text')
    const truncated = bytes.subarray(0, Math.floor(bytes.length / 2))
    for (const body of [renamed, await webp(2049), truncated]) {
      upload('key', body, 'image/webp')
      await expect(readReferenceUpload(store, 'key', describeFile(body))).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    }
    upload('key', bytes, 'image/webp')
    await expect(readReferenceUpload(store, 'key', { size: bytes.length, sha256: '0'.repeat(64) })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })

  it('bounds the GET when a second PUT replaces the object after HEAD', async () => {
    const { store, upload } = createMemoryStore()
    const body = await webp()
    upload('key', body, 'image/webp')
    const get = vi.spyOn(store, 'get').mockResolvedValue(Buffer.alloc(body.length + 1))
    await expect(readReferenceUpload(store, 'key', describeFile(body))).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(get).toHaveBeenCalledWith('key', body.length + 1)
  })
})
