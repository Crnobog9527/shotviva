import { describe, expect, it } from 'vitest'

import { createMemoryStore } from '../../../tests/fakes/memory-store'
import { copyBackKeptInputs, keepJobInputs } from './kept-inputs'
import { isOwnInputKey, keptInputKeyFor, newInputKey } from './keys'

const USER = '0b6f3f0e-5d1c-4c47-9a49-6a3f6f8d2e11'
const JOB = '5c0d9a8e-1111-4222-8333-444455556666'
const job = { userId: USER, jobId: JOB }

describe('keepJobInputs', () => {
  it('copies each upload next to the result, in order', async () => {
    const r2 = createMemoryStore()
    const uploads = [newInputKey(USER, 'image/jpeg'), newInputKey(USER, 'image/png')]
    uploads.forEach((key, i) => r2.upload(key, new Uint8Array([i + 1]), i ? 'image/png' : 'image/jpeg'))
    const kept = await keepJobInputs(r2.store, job, uploads)
    expect(kept).toEqual([`outputs/${USER}/${JOB}-in-1.jpg`, `outputs/${USER}/${JOB}-in-2.png`])
    expect(r2.objects.get(kept[1]!)).toEqual({ body: new Uint8Array([2]), contentType: 'image/png' })
    // A copy: the upload itself is left for the 7-day lifecycle.
    expect(r2.objects.has(uploads[0]!)).toBe(true)
  })

  it('leaves out a copy that fails instead of throwing', async () => {
    const r2 = createMemoryStore()
    const upload = newInputKey(USER, 'image/jpeg')
    r2.upload(upload, new Uint8Array([1]), 'image/jpeg')
    r2.failCopy.next = true
    await expect(keepJobInputs(r2.store, job, [upload])).resolves.toEqual([])
    await expect(keepJobInputs(r2.store, job, [newInputKey(USER, 'image/jpeg')])).resolves.toEqual([])
  })
})

describe('copyBackKeptInputs', () => {
  it('turns each kept photo into a fresh upload of the same user', async () => {
    const r2 = createMemoryStore()
    const kept = keptInputKeyFor(USER, JOB, 1, 'inputs/x/y.jpg')
    r2.upload(kept, new Uint8Array([7, 7, 7]), 'image/jpeg')
    const [photo] = await copyBackKeptInputs(r2.store, job, [kept])
    expect(photo?.bytes).toBe(3)
    expect(isOwnInputKey(USER, photo!.inputKey)).toBe(true)
    expect(r2.objects.get(photo!.inputKey)?.contentType).toBe('image/jpeg')
    expect(r2.objects.has(kept)).toBe(true)
  })

  it('refuses keys outside the job’s slot and missing objects', async () => {
    const r2 = createMemoryStore()
    const other = `outputs/${USER}/00000000-0000-4000-8000-000000000000-in-1.jpg`
    r2.upload(other, new Uint8Array([1]), 'image/jpeg')
    await expect(copyBackKeptInputs(r2.store, job, [other])).rejects.toThrow(/not a kept input/)
    await expect(copyBackKeptInputs(r2.store, job, [`outputs/${USER}/${JOB}-in-1.jpg`])).rejects.toThrow(/missing/)
  })
})
