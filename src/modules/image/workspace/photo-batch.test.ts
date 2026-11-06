import { describe, expect, it } from 'vitest'

import { summarize, takeBatch, uploadsToStart, type BatchPhoto } from './photo-batch'
import type { UploadState } from './use-upload'

const photo = (id: string, upload: UploadState): BatchPhoto => ({ id, url: `blob:${id}`, bytes: 1, ratio: null, upload })
const idle = (id: string) => photo(id, { phase: 'idle' })

describe('takeBatch', () => {
  it('Starter (batchMax 1): a multi-select keeps the first photo and counts the rest', () => {
    expect(takeBatch(['a', 'b', 'c'], 1)).toEqual({ accepted: ['a'], dropped: 2 })
  })

  it('Pro: up to 10, minus what is already picked', () => {
    const files = Array.from({ length: 12 }, (_, i) => `f${i}`)
    expect(takeBatch(files, 10).accepted).toHaveLength(10)
    expect(takeBatch(files, 10).dropped).toBe(2)
    expect(takeBatch(files, 3)).toEqual({ accepted: ['f0', 'f1', 'f2'], dropped: 9 })
    expect(takeBatch(files, 0)).toEqual({ accepted: [], dropped: 12 })
  })
})

describe('uploadsToStart', () => {
  it('starts waiting photos in pick order, three at a time', () => {
    expect(uploadsToStart([idle('a'), idle('b'), idle('c'), idle('d')])).toEqual(['a', 'b', 'c'])
    const busy = [photo('a', { phase: 'uploading', progress: 0.4 }), photo('b', { phase: 'compressing', progress: 0 }), idle('c'), idle('d')]
    expect(uploadsToStart(busy)).toEqual(['c'])
  })

  it('a finished or failed upload frees its slot', () => {
    const settled = [photo('a', { phase: 'done', inputKey: 'k' }), photo('b', { phase: 'error', code: 'UPLOAD_FAILED', message: '' }), idle('c')]
    expect(uploadsToStart(settled)).toEqual(['c'])
  })
})

describe('summarize', () => {
  it('waits for every upload, then is ready with the uploaded keys', () => {
    expect(summarize([]).photo).toBe('none')
    const mixed = [photo('a', { phase: 'done', inputKey: 'k-a' }), idle('b')]
    expect(summarize(mixed)).toMatchObject({ photo: 'uploading', planned: 2 })
    const done = [photo('a', { phase: 'done', inputKey: 'k-a' }), photo('b', { phase: 'error', code: 'IMAGE_TOO_LARGE', message: '' })]
    expect(summarize(done)).toMatchObject({ photo: 'ready', planned: 1 })
    expect(summarize(done).ready.map((r) => r.inputKey)).toEqual(['k-a'])
  })

  it('a batch whose every upload failed has no photo to generate', () => {
    expect(summarize([photo('a', { phase: 'error', code: 'UPLOAD_FAILED', message: '' })]).photo).toBe('none')
  })
})
