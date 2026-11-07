import { describe, expect, it, vi } from 'vitest'

import { cancelReturnUrl, handleCancelReturn } from './cancel-return'

const query = (url: string) => new URL(url).searchParams
const ATTEMPT = '0b4e8c4e-6f1d-4c3a-9a51-2d7f1e0c9b11'
const cancelUrl = `https://x.app/api/checkout/cancel?p=pro_yearly&m=cn_card&l=zh&c=${ATTEMPT}`

describe('Stripe cancel return (T74 checkout_cancel)', () => {
  it('names the product, method, language and a fresh attempt id in the cancel URL', () => {
    expect(cancelReturnUrl('https://pr-1.example.app', { product_id: 'pack_m', method: 'alipay', locale: 'zh' }, ATTEMPT)).toBe(
      `https://pr-1.example.app/api/checkout/cancel?p=pack_m&m=alipay&l=zh&c=${ATTEMPT}`,
    )
    const a = new URL(cancelReturnUrl('https://x.app', { product_id: 'pack_m', method: 'card', locale: 'en' })).searchParams.get('c')
    const b = new URL(cancelReturnUrl('https://x.app', { product_id: 'pack_m', method: 'card', locale: 'en' })).searchParams.get('c')
    expect(a).toMatch(/^[0-9a-f-]{36}$/)
    expect(a).not.toBe(b)
  })

  it('counts a signed-in cancel once, server-side, lands on pricing in the buyer’s language and remembers the attempt', () => {
    const track = vi.fn()
    expect(handleCancelReturn(query(cancelUrl), 'user-1', track)).toEqual({ target: '/zh/pricing?checkout=cancel', remember: ATTEMPT })
    expect(track).toHaveBeenCalledExactlyOnceWith('user-1', { product_id: 'pro_yearly', method: 'cn_card' }, 'zh')
  })

  it('does not count the same checkout again (history back, reload), but counts a new one', () => {
    const track = vi.fn()
    expect(handleCancelReturn(query(cancelUrl), 'user-1', track, ATTEMPT)).toEqual({ target: '/zh/pricing?checkout=cancel', remember: null })
    expect(track).not.toHaveBeenCalled()
    const next = cancelUrl.replace(ATTEMPT, '9f1e2d3c-4b5a-4968-8776-655443322110')
    expect(handleCancelReturn(query(next), 'user-1', track, ATTEMPT).remember).toBe('9f1e2d3c-4b5a-4968-8776-655443322110')
    expect(track).toHaveBeenCalledOnce()
  })

  it('still counts sessions created before attempt ids existed, without remembering anything', () => {
    const track = vi.fn()
    expect(handleCancelReturn(query('https://x.app/c?p=pack_s&m=card&l=en'), 'user-1', track)).toEqual({ target: '/pricing?checkout=cancel', remember: null })
    expect(track).toHaveBeenCalledOnce()
  })

  it('still lands on pricing, uncounted, when signed out or the query is not ours', () => {
    const track = vi.fn()
    expect(handleCancelReturn(query('https://x.app/c?p=pro_yearly&m=card&l=en'), null, track).target).toBe('/pricing?checkout=cancel')
    expect(handleCancelReturn(query('https://x.app/c?p=free_lunch&m=card&l=zh'), 'user-1', track).target).toBe('/zh/pricing?checkout=cancel')
    expect(handleCancelReturn(query('https://x.app/c?p=pack_s&m=paypal'), 'user-1', track).target).toBe('/pricing?checkout=cancel')
    expect(track).not.toHaveBeenCalled()
  })
})
