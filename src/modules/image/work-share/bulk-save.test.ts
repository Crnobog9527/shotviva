import { describe, expect, it } from 'vitest'

import { namedFor } from '../batch/photo-save'
import { downloadEach, downloadHref, fetchWork, nameFrom, pickedLinks, pickedSource, toDownload } from './bulk-save'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

describe('saving the works picked on Photos', () => {
  it('uses each work\'s own download route', async () => {
    expect(downloadHref(A)).toBe(`/api/files/${A}?download=1`)
    expect(pickedLinks([A, B])).toEqual([
      { url: `/api/files/${A}?download=1`, name: 'shotviva-11111111.png' },
      { url: `/api/files/${B}?download=1`, name: 'shotviva-22222222.png' },
    ])
    expect(await pickedSource([A])()).toEqual({ kind: 'ready', photos: pickedLinks([A]) })
    expect(await pickedSource([])()).toEqual({ kind: 'error', code: 'NOT_FOUND' })
  })

  it('fetches and saves one work at a time, and counts only what arrived', async () => {
    const log: string[] = []
    const steps: string[] = []
    const get = async (id: string) => {
      log.push(`get ${id}`)
      return id === B ? null : { name: `${id}.png`, blob: new Blob(['x']) }
    }
    const progress = await downloadEach([A, B, A], (p) => steps.push(`${p.saved}/${p.failed.length}`), () => true, get, (file) => void log.push(`save ${file.name}`))
    expect(progress).toEqual({ saved: 2, failed: [B] })
    expect(log).toEqual([`get ${A}`, `save ${A}.png`, `get ${B}`, `get ${A}`, `save ${A}.png`])
    expect(steps).toEqual(['1/0', '1/1', '2/1'])
  })

  it('retries only the works that failed, never the ones already saved', async () => {
    const C = '33333333-3333-4333-8333-333333333333'
    const asked: string[] = []
    const savedNames: string[] = []
    let broken = new Set([B, C])
    const get = async (id: string) => {
      asked.push(id)
      return broken.has(id) ? null : { name: id, blob: new Blob(['x']) }
    }
    const save = (file: { name: string }) => void savedNames.push(file.name)
    // The first press asks for everything picked.
    expect(toDownload([A, B, C], null)).toEqual([A, B, C])
    const first = await downloadEach(toDownload([A, B, C], null), () => undefined, () => true, get, save)
    expect(first).toEqual({ saved: 1, failed: [B, C] })
    // The second asks for the two that failed; one of them arrives now.
    broken = new Set([C])
    const second = await downloadEach(toDownload([A, B, C], first), () => undefined, () => true, get, save)
    expect(second).toEqual({ saved: 1, failed: [C] })
    expect(asked).toEqual([A, B, C, B, C])
    // A was fetched and saved once only.
    expect(savedNames).toEqual([A, B])
    // Nothing left to retry: nothing is asked for.
    expect(toDownload([A, B, C], { saved: 3, failed: [] })).toEqual([])
  })

  it('stops when the bar is gone, without saving the file in flight', async () => {
    const saved: string[] = []
    let alive = true
    const get = async (id: string) => {
      alive = false
      return { name: id, blob: new Blob(['x']) }
    }
    expect(await downloadEach([A, B], () => undefined, () => alive, get, (file) => void saved.push(file.name))).toEqual({ saved: 0, failed: [] })
    expect(saved).toEqual([])
  })

})

describe('one picked work\'s file', () => {
  it('fetches a work from its own route with the session, named as the route named it', async () => {
    const calls: [string, RequestInit | undefined][] = []
    const answer = (init: ResponseInit, body = 'x') => async (url: RequestInfo | URL, options?: RequestInit) => {
      calls.push([String(url), options])
      return new Response(body, init)
    }
    const named = await fetchWork(A, answer({ headers: { 'Content-Type': 'image/jpeg', 'Content-Disposition': `attachment; filename="shotviva-${A}.jpg"` } }))
    expect(named?.name).toBe(`shotviva-${A}.jpg`)
    expect(calls[0]).toEqual([downloadHref(A), { credentials: 'same-origin', cache: 'no-store' }])
    // Redirected to storage: the header is not readable there, so the name follows the bytes.
    expect((await fetchWork(A, answer({ headers: { 'Content-Type': 'image/png' } })))?.name).toBe(`shotviva-${A}.png`)
    expect((await fetchWork(A, answer({ headers: { 'Content-Type': 'image/jpeg' } })))?.name).toBe(`shotviva-${A}.jpg`)
    // Refused, missing or offline: not a download.
    expect(await fetchWork(A, answer({ status: 404 }))).toBeNull()
    expect(await fetchWork(A, async () => { throw new Error('offline') })).toBeNull()
  })

  it('reads the file name from Content-Disposition', () => {
    expect(nameFrom('attachment; filename="a b.png"')).toBe('a b.png')
    expect(nameFrom("attachment; filename*=UTF-8''%E8%8F%9C.png")).toBe('菜.png')
    expect(nameFrom("attachment; filename*=UTF-8''%E0%A4%A")).toBeNull()
    expect(nameFrom('attachment')).toBeNull()
    expect(nameFrom(null)).toBeNull()
  })

  it('names a saved file by what its bytes are', () => {
    expect(namedFor('shotviva-1.png', 'image/jpeg')).toEqual({ name: 'shotviva-1.jpg', type: 'image/jpeg' })
    expect(namedFor('shotviva-1.png', 'image/png')).toEqual({ name: 'shotviva-1.png', type: 'image/png' })
    // A batch's own names keep their extension when the type agrees or is not given.
    expect(namedFor('菜_模板_01.jpeg', 'image/jpeg')).toEqual({ name: '菜_模板_01.jpeg', type: 'image/jpeg' })
    expect(namedFor('a.jpg', '')).toEqual({ name: 'a.jpg', type: 'image/jpeg' })
    expect(namedFor('noext', 'image/webp')).toEqual({ name: 'noext.webp', type: 'image/webp' })
    expect(namedFor('a.png', 'application/octet-stream')).toEqual({ name: 'a.png', type: 'application/octet-stream' })
  })
})
