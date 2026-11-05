import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'

import { decide, gateFor, notFoundResponse, proxyGate } from './proxy-gates'

const user = (role: 'user' | 'admin', emailVerified = true) => ({ id: 'u', email: null, role, emailVerified })

describe('gateFor', () => {
  it.each([
    ['/admin', 'admin'],
    ['/admin/templates', 'admin'],
    ['/administrator', null],
    ['/account', 'signed_in'],
    ['/reset/update', 'signed_in'],
    ['/reset', null],
    ['/generate', 'signed_in'],
    ['/generate/pure-white', 'signed_in'],
    ['/photos', 'signed_in'],
    ['/photos/9b1c', 'signed_in'],
    ['/wishlist', 'signed_in'],
    ['/generated', null],
    ['/connect/graylum', 'signed_in'],
    ['/connect/graylum/', 'signed_in'],
    ['/connect/graylum/authorize', null],
    ['/', null],
  ])('%s -> %s', (path, gate) => {
    expect(gateFor(path)).toBe(gate)
  })
})

describe('decide', () => {
  it('lets only verified admins through /admin', () => {
    expect(decide('admin', user('admin'), '/admin', '')).toBe('pass')
    expect(decide('admin', user('user'), '/admin', '')).toBe('not_found')
    expect(decide('admin', user('admin', false), '/admin', '')).toBe('not_found')
    expect(decide('admin', null, '/admin', '')).toBe('not_found')
  })

  it('sends visitors to login with the page as next, and unverified users to the notice', () => {
    expect(decide('signed_in', null, '/account', '?x=1')).toEqual({ redirect: '/login?next=%2Faccount%3Fx%3D1' })
    expect(decide('signed_in', user('user', false), '/account', '')).toEqual({ redirect: '/login?error=unverified' })
    expect(decide('signed_in', user('user'), '/account', '')).toBe('pass')
  })
})

describe('proxyGate without a session cookie', () => {
  it('404s /admin with noindex before rendering', async () => {
    const response = await proxyGate(new NextRequest('http://localhost:3000/admin/templates'))
    expect(response.status).toBe(404)
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow')
  })

  it('307s /account to login', async () => {
    const response = await proxyGate(new NextRequest('http://localhost:3000/account'))
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('http://localhost:3000/login?next=%2Faccount')
  })

  it('passes marketing pages through', async () => {
    const response = await proxyGate(new NextRequest('http://localhost:3000/pricing'))
    expect(response.status).toBe(200)
    expect(notFoundResponse().status).toBe(404)
  })
})
