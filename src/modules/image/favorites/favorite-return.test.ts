import { describe, expect, it } from 'vitest'

import { sanitizeNext } from '@/core/auth/redirect-target'

import { favoriteFromSearch, signInForFavorite, withoutFavorite } from './favorite-return'

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
