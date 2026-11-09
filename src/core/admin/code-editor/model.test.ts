import { describe, expect, it } from 'vitest'
import type { CodeProduct } from '../../codes/admin'
import { COPY, PRODUCTS } from './copy'
import { emptyCode, formPatch, giftChanged, localDate, offerError, productGroup, tooLow } from './model'

const target: CodeProduct = { id: 'starter_yearly', subscription: true, priceCents: 151, credits: 1 }
const floor: CodeProduct = { id: 'max_yearly', subscription: true, priceCents: 151, credits: 2 }

describe('campaign editor', () => {
  it('rejects a half-cent below the collectible floor after the unrounded unit price equals it', () => {
    const percent = 50
    for (const multiplier of [1, 100]) {
      const p = { ...target, credits: target.credits * multiplier }, f = { ...floor, credits: floor.credits * multiplier }
      expect(tooLow(p,f,percent)).toBe(true)
      expect(offerError({catalog:[p,f], floor:f},percent,[p.id])).toBe(COPY.invalidTargets([PRODUCTS[p.id]]))
      expect(tooLow({...p,priceCents:152},f,percent)).toBe(false)
    }
  })

  it('includes all configured products in shortcuts, including ineligible products to explain why a selection fails', () => {
    const ids = [target.id, floor.id, 'starter_monthly','pack_l'] as const
    expect(productGroup([...ids],'yearly')).toEqual([target.id,floor.id])
    expect(productGroup([...ids],'monthly')).toEqual(['starter_monthly'])
    expect(productGroup([...ids],'packs')).toEqual(['pack_l'])
    expect(productGroup([...ids],'all')).toEqual(ids)
  })

  it('editing a note preserves locked discounts, concurrent field edits, and sub-minute timestamps', () => {
    const old = {...emptyCode, code: 'QA20', discount_percent: 20, starts_at:'2026-11-09T00:00:03.456Z'}
    const data = new FormData()
    data.set('code',old.code)
    data.set('starts',localDate(old.starts_at))
    data.set('note','新备注')
    expect(formPatch(data,old)).toEqual({note:'新备注'})
  })

  it('a gift-only save reads credits and quota from the form and omits discount fields', () => {
    const data = new FormData()
    const amount = target.priceCents, quota = floor.credits
    for (const [key,value] of Object.entries({code:' gift ', credits:String(amount), pool:'paid', quota:String(quota)})) {
      data.set(key,value)
    }
    expect(formPatch(data,null)).toMatchObject({code:'GIFT',invitee_credits:amount,invitee_pool:'paid',max_redemptions:quota})
    expect(formPatch(data,null)).not.toHaveProperty('discount_percent')
    const code = {...emptyCode, invitee_credits:amount, invitee_pool:'paid' as const, max_redemptions:quota}
    expect(giftChanged(code,String(amount),'paid',String(quota))).toBe(false)
    expect(giftChanged(code,String(amount),'paid','')).toBe(true)
  })
})
