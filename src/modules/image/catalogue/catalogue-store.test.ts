import { afterEach, describe, expect, it, vi } from 'vitest'

import { fetchNewerCatalogue, readDeviceCatalogue, writeDeviceCatalogue } from './catalogue-store'
import { CATALOGUE_SCHEMA } from './public-catalogue'

const file = (version: string, locale = 'zh') => ({ schema: CATALOGUE_SCHEMA, locale, version, payload: { browse: { filters: [], entries: [] }, templates: [] } })
const answer = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }))

afterEach(() => vi.unstubAllGlobals())

// No IndexedDB (private mode, an old browser, a server render): there is simply no copy.
describe('device store without IndexedDB', () => {
  it('reads nothing and writes nothing, without throwing', async () => {
    await expect(readDeviceCatalogue('zh')).resolves.toBeNull()
    await expect(writeDeviceCatalogue(file('0123456789abcdef'))).resolves.toBeUndefined()
  })
})

describe('fetching a newer file', () => {
  it('with nothing on the device, reads latest', async () => {
    const fetch = vi.fn(() => answer(file('0123456789abcdef')))
    vi.stubGlobal('fetch', fetch)
    await expect(fetchNewerCatalogue('zh', null)).resolves.toMatchObject({ version: '0123456789abcdef' })
    expect(fetch).toHaveBeenCalledWith('/api/catalogue/public/zh/latest', { credentials: 'omit' })
  })

  it('with a copy, asks for the version only, and the file only when it moved', async () => {
    const same = vi.fn(() => answer({ version: '0123456789abcdef' }))
    vi.stubGlobal('fetch', same)
    await expect(fetchNewerCatalogue('zh', '0123456789abcdef')).resolves.toBeNull()
    expect(same).toHaveBeenCalledTimes(1)
    const moved = vi.fn((url: string) => (url.endsWith('/current') ? answer({ version: 'fedcba9876543210' }) : answer(file('fedcba9876543210'))))
    vi.stubGlobal('fetch', moved)
    await expect(fetchNewerCatalogue('zh', '0123456789abcdef')).resolves.toMatchObject({ version: 'fedcba9876543210' })
    expect(moved).toHaveBeenLastCalledWith('/api/catalogue/public/zh/fedcba9876543210', { credentials: 'omit' })
  })

  it('rejects a file of another schema or language, and an error answer', async () => {
    vi.stubGlobal('fetch', vi.fn(() => answer({ ...file('0123456789abcdef'), schema: CATALOGUE_SCHEMA + 1 })))
    await expect(fetchNewerCatalogue('zh', null)).rejects.toThrow()
    vi.stubGlobal('fetch', vi.fn(() => answer(file('0123456789abcdef', 'en'))))
    await expect(fetchNewerCatalogue('zh', null)).rejects.toThrow()
    vi.stubGlobal('fetch', vi.fn(() => answer({ error: 'UNAVAILABLE' }, 503)))
    await expect(fetchNewerCatalogue('zh', null)).rejects.toThrow()
  })
})
