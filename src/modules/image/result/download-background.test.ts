import { describe, expect, it } from 'vitest'

import { BACKGROUND_STORAGE_KEY, fileHref, offersChoice, readSavedBackground, saveBackground, shareSource } from './download-background'

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => void values.set(key, value), values }
}

describe('白底 / 透明底 choice', () => {
  it('starts on white and remembers the last pick on this browser', () => {
    const storage = memoryStorage()
    expect(readSavedBackground(storage)).toBe('white')
    saveBackground(storage, 'transparent')
    expect(storage.values.get(BACKGROUND_STORAGE_KEY)).toBe('transparent')
    expect(readSavedBackground(storage)).toBe('transparent')
    expect(readSavedBackground(memoryStorage({ [BACKGROUND_STORAGE_KEY]: 'black' }))).toBe('white')
  })

  it('survives blocked storage, keeping this page’s pick', () => {
    const blocked = { getItem: () => { throw new Error('SecurityError') }, setItem: () => { throw new Error('QuotaExceeded') } }
    expect(() => saveBackground(blocked, 'transparent')).not.toThrow()
    expect(readSavedBackground(blocked, 'transparent')).toBe('transparent')
    expect(readSavedBackground(null)).toBe('white')
  })

  it('is offered for cut-outs only: the server’s record first, else what the browser saw in a clean work', () => {
    expect(offersChoice({ pool: 'free', transparent: true }, false)).toBe(true)
    expect(offersChoice({ pool: 'paid', transparent: false }, true)).toBe(false)
    expect(offersChoice({ pool: 'paid', transparent: null }, true)).toBe(true)
    // A free work arrives as a marked JPEG, so the browser's look proves nothing.
    expect(offersChoice({ pool: 'free', transparent: null }, true)).toBe(false)
    expect(offersChoice(undefined, true)).toBe(false)
  })

  it('builds the file links: plain for other works, ?bg= for cut-outs', () => {
    expect(fileHref('/api/files/j1', null, true)).toBe('/api/files/j1?download=1')
    expect(fileHref('/api/files/j1', null, false)).toBe('/api/files/j1')
    expect(fileHref('/api/files/j1', 'white', true)).toBe('/api/files/j1?bg=white&download=1')
    expect(fileHref('/api/files/j1', 'transparent', false)).toBe('/api/files/j1?bg=transparent')
  })

  it('reads Share’s file from the shown result, except a free cut-out’s marked PNG', () => {
    expect(shareSource('/api/files/j1', { pool: 'paid', transparent: true }, 'transparent')).toBe('/api/files/j1')
    expect(shareSource('/api/files/j1', { pool: 'free', transparent: true }, 'white')).toBe('/api/files/j1')
    expect(shareSource('/api/files/j1', { pool: 'free', transparent: true }, 'transparent')).toBe('/api/files/j1?bg=transparent')
  })
})
