import { describe, expect, it, vi } from 'vitest'

import { cancelReturnUrl, handleCancelReturn } from './cancel-return'

const query = (url: string) => new URL(url).searchParams

describe('Stripe cancel return (T74 checkout_cancel)', () => {
  it('names the product, method and language in the cancel URL', () => {
    expect(cancelReturnUrl('https://pr-1.example.app', { product_id: 'pack_m', method: 'alipay', locale: 'zh' })).toBe(
      'https://pr-1.example.app/api/checkout/cancel?p=pack_m&m=alipay&l=zh',
    )
  })

  it('counts a signed-in cancel once, server-side, and lands on pricing in the buyer’s language', () => {
    const track = vi.fn()
    const target = handleCancelReturn(query('https://x.app/api/checkout/cancel?p=pro_yearly&m=cn_card&l=zh'), 'user-1', track)
    expect(target).toBe('/zh/pricing?checkout=cancel')
    expect(track).toHaveBeenCalledExactlyOnceWith('user-1', { product_id: 'pro_yearly', method: 'cn_card' }, 'zh')
  })

  it('still lands on pricing, uncounted, when signed out or the query is not ours', () => {
    const track = vi.fn()
    expect(handleCancelReturn(query('https://x.app/c?p=pro_yearly&m=card&l=en'), null, track)).toBe('/pricing?checkout=cancel')
    expect(handleCancelReturn(query('https://x.app/c?p=free_lunch&m=card&l=zh'), 'user-1', track)).toBe('/zh/pricing?checkout=cancel')
    expect(handleCancelReturn(query('https://x.app/c?p=pack_s&m=paypal'), 'user-1', track)).toBe('/pricing?checkout=cancel')
    expect(track).not.toHaveBeenCalled()
  })
})
