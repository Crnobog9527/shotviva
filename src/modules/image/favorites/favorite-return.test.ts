import { describe, expect, it } from 'vitest'

import { sanitizeNext } from '@/core/auth/redirect-target'

import { favoriteFromSearch, rememberFavoriteReturn, signInForFavorite, takeFavoriteReturn, withoutFavorite } from './favorite-return'

describe('signed-out favorite round trip (ARCHITECTURE §5.1b)', () => {
  it('sends the visitor to sign-in with a same-site next that carries the template', () => {
    const href = signInForFavorite('/zh', 'pure-white')
    expect(href).toBe('/login?next=%2Fzh%3Ffavorite%3Dpure-white')
    const next = decodeURIComponent(href.split('next=')[1] ?? '')
    // The login page keeps it as written.
    expect(sanitizeNext(next)).toBe('/zh?favorite=pure-white')
  })

  it('keeps the return page’s own query', () => {
    expect(signInForFavorite('/?open=ramen', 'pure-white')).toBe(`/login?next=${encodeURIComponent('/?open=ramen&favorite=pure-white')}`)
  })

  it('reads only template-shaped ids back', () => {
    expect(favoriteFromSearch('?favorite=pure-white')).toBe('pure-white')
    expect(favoriteFromSearch('?favorite=%3Cscript%3E')).toBeNull()
    expect(favoriteFromSearch('?favorite=')).toBeNull()
    expect(favoriteFromSearch('')).toBeNull()
  })

  it('drops the parameter and keeps the rest of the address', () => {
    expect(withoutFavorite('https://shotviva.com/zh?favorite=pure-white&x=1#top')).toBe('/zh?x=1#top')
  })
})

// An in-memory stand-in for sessionStorage.
function memoryStore() {
  const map = new Map<string, string>()
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  }
}

describe('the return marker', () => {
  it('saves only the template this tab tapped, once', () => {
    const store = memoryStore()
    rememberFavoriteReturn('pure-white', store)
    expect(takeFavoriteReturn('pure-white', store)).toBe(true)
    expect(takeFavoriteReturn('pure-white', store)).toBe(false)
  })

  it('ignores a crafted link: no marker, or a marker for another template (and clears it)', () => {
    const store = memoryStore()
    expect(takeFavoriteReturn('pure-white', store)).toBe(false)
    rememberFavoriteReturn('ramen-studio', store)
    expect(takeFavoriteReturn('pure-white', store)).toBe(false)
    expect(takeFavoriteReturn('ramen-studio', store)).toBe(false)
  })

  it('saves nothing when storage is unavailable or throws', () => {
    expect(takeFavoriteReturn('pure-white', null)).toBe(false)
    const broken = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {},
    }
    expect(() => rememberFavoriteReturn('pure-white', broken)).not.toThrow()
    expect(takeFavoriteReturn('pure-white', broken)).toBe(false)
  })
})
