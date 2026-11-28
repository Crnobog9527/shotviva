import { describe, expect, it } from 'vitest'

import { namedFor } from '../batch/photo-save'
import { DOWNLOAD_GAP_MS, downloadEach, downloadHref, pickedLinks, pickedSource } from './bulk-save'

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

  it('starts the downloads one after another, apart', async () => {
    const log: string[] = []
    const steps: number[] = []
    const started = await downloadEach([A, B], (n) => steps.push(n), () => true, (href) => log.push(href), async (ms) => void log.push(`wait ${ms}`))
    expect(started).toBe(2)
    expect(log).toEqual([downloadHref(A), `wait ${DOWNLOAD_GAP_MS}`, downloadHref(B)])
    expect(steps).toEqual([1, 2])
  })

  it('stops when the bar is gone', async () => {
    const log: string[] = []
    let alive = true
    const started = await downloadEach([A, B], () => { alive = false }, () => alive, (href) => log.push(href), async () => undefined)
    expect(started).toBe(1)
    expect(log).toEqual([downloadHref(A)])
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
