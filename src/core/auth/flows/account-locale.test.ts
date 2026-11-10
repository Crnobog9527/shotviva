import { NextRequest } from 'next/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../session', () => ({ getSessionUser: vi.fn() }))
vi.mock('../supabase-server', () => ({ createServerSupabase: vi.fn() }))

const { handleAccountLocale } = await import('./account-locale')

const ORIGIN = 'http://localhost:3000'
const request = (body: string, origin: string | null = ORIGIN) => {
  const headers = new Headers({ 'content-type': 'text/plain' })
  if (origin) headers.set('origin', origin)
  return new NextRequest(`${ORIGIN}/api/locale`, { method: 'POST', headers, body })
}
const account = (locale: 'en' | 'zh' | null) => ({ id: 'u', email: null, phone: null, role: 'user' as const, verified: true, banned: false, locale, onboarding: { wishlistSeen: false, wishlistHintSeen: false } })

// The language switches' beacon (ARCHITECTURE §17): a signed-in account keeps its choice.
describe('POST /api/locale', () => {
  it('stores a new choice in user_metadata.locale for a signed-in account', async () => {
    const saveLocale = vi.fn().mockResolvedValue(undefined)
    const response = await handleAccountLocale(request('zh'), { sessionUser: async () => account('en'), saveLocale })
    expect(response.status).toBe(204)
    expect(saveLocale).toHaveBeenCalledExactlyOnceWith('zh')
  })

  it('does nothing for a visitor who is not signed in, or when nothing changed', async () => {
    const saveLocale = vi.fn()
    expect((await handleAccountLocale(request('zh'), { sessionUser: async () => null, saveLocale })).status).toBe(204)
    expect((await handleAccountLocale(request('zh'), { sessionUser: async () => account('zh'), saveLocale })).status).toBe(204)
    expect(saveLocale).not.toHaveBeenCalled()
  })

  it('rejects anything but a language, and other origins', async () => {
    const saveLocale = vi.fn()
    expect((await handleAccountLocale(request('fr'), { sessionUser: async () => account('en'), saveLocale })).status).toBe(400)
    await expect(handleAccountLocale(request('zh', 'https://evil.example'), { sessionUser: async () => account('en'), saveLocale })).rejects.toThrow()
    expect(saveLocale).not.toHaveBeenCalled()
  })
})
