import { afterEach, describe, expect, it, vi } from 'vitest'

import { albumSrc, savedNotes, saveRoute } from './album-save'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const sharing = { share: () => undefined, canShare: () => true }

describe('where picked works are saved to', () => {
  it('a desktop downloads, whatever it can share', () => {
    expect(saveRoute(false, sharing)).toBe('download')
    expect(saveRoute(false, undefined)).toBe('download')
  })

  it('a phone that can share files uses the share sheet', () => {
    expect(saveRoute(true, sharing)).toBe('share')
  })

  it('a phone that cannot share files shows the album view, never a download', () => {
    expect(saveRoute(true, {})).toBe('album')
    expect(saveRoute(true, undefined)).toBe('album')
    // share() without canShare(): files cannot be asked about, so they cannot be shared.
    expect(saveRoute(true, { share: () => undefined })).toBe('album')
  })

  it('a phone whose share sheet refused the files shows the album view', () => {
    expect(saveRoute(true, sharing, true)).toBe('album')
  })

  it('shows the file without the download flag', () => {
    expect(albumSrc(A)).toBe(`/api/files/${A}`)
  })
})

describe('noting works shown in the album view', () => {
  afterEach(() => vi.useRealTimers())

  it('notes each work once, works that load together in one call', async () => {
    vi.useFakeTimers()
    const calls: string[][] = []
    const note = savedNotes(async (ids) => void calls.push(ids), 100, new Set())
    note(A)
    note(B)
    note(A)
    await vi.advanceTimersByTimeAsync(100)
    expect(calls).toEqual([[A, B]])
    note(A)
    note(B)
    await vi.advanceTimersByTimeAsync(100)
    expect(calls).toHaveLength(1)
  })

  it('remembers across views of the same page', async () => {
    vi.useFakeTimers()
    const calls: string[][] = []
    const noted = new Set<string>()
    savedNotes(async (ids) => void calls.push(ids), 100, noted)(A)
    await vi.advanceTimersByTimeAsync(100)
    const again = savedNotes(async (ids) => void calls.push(ids), 100, noted)
    again(A)
    again(B)
    await vi.advanceTimersByTimeAsync(100)
    expect(calls).toEqual([[A], [B]])
  })

  it('asks again for works whose note failed', async () => {
    vi.useFakeTimers()
    const calls: string[][] = []
    let broken = true
    const note = savedNotes(async (ids) => {
      calls.push(ids)
      if (broken) throw new Error('offline')
    }, 100, new Set())
    note(A)
    await vi.advanceTimersByTimeAsync(100)
    broken = false
    note(A)
    await vi.advanceTimersByTimeAsync(100)
    expect(calls).toEqual([[A], [A]])
  })
})
