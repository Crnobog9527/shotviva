import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => vi.unstubAllGlobals())

import { albumSrc, savedHref, savedNotes, saveRoute } from './album-save'

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

describe('noting works shown full size for a long press', () => {
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

  it('posts to the work\'s own saved route', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetcher)
    savedNotes(undefined, new Set())(albumSrc(A))
    await settle()
    expect(savedHref(albumSrc(A))).toBe(`/api/files/${A}/saved`)
    expect(fetcher).toHaveBeenCalledWith(`/api/files/${A}/saved`, { method: 'POST', credentials: 'same-origin' })
  })

  it('notes each work once, however often it is shown', async () => {
    const calls: string[] = []
    const note = savedNotes(async (url) => void calls.push(url), new Set())
    note(albumSrc(A))
    note(albumSrc(B))
    note(albumSrc(A))
    await settle()
    expect(calls).toEqual([albumSrc(A), albumSrc(B)])
  })

  it('the album view and the viewer\'s hold sheet share one record: the same work is noted once', async () => {
    const calls: string[] = []
    const noted = new Set<string>()
    const send = async (url: string) => void calls.push(url)
    const fromAlbum = savedNotes(send, noted)
    const fromViewer = savedNotes(send, noted)
    // The viewer's fileUrl is the address the album view shows.
    fromViewer(`/api/files/${A}`)
    fromAlbum(albumSrc(A))
    fromAlbum(albumSrc(B))
    await settle()
    expect(calls).toEqual([albumSrc(A), albumSrc(B)])
  })

  it('asks again for a work whose note failed', async () => {
    const calls: string[] = []
    let broken = true
    const note = savedNotes(async (url) => {
      calls.push(url)
      if (broken) throw new Error('offline')
    }, new Set())
    note(albumSrc(A))
    await settle()
    broken = false
    note(albumSrc(A))
    await settle()
    expect(calls).toEqual([albumSrc(A), albumSrc(A)])
  })
})
