import { describe, expect, it } from 'vitest'

import { EMPTY_INQUIRY, FIELD_ORDER, fieldError, inquiryShape, validateInquiry, type InquiryValues } from './validate'

// T86 (DESIGN §6.9 item 8): what the form requires, the same check in the browser and on the server.

const GOOD: InquiryValues = {
  ...EMPTY_INQUIRY,
  name: 'Lin Wei',
  email: 'lin@example.com',
  company: 'Acme Foods',
  volume: '500_2000',
  uses: ['ecommerce'],
  message: 'About 300 product photos a month.',
  consent: true,
}

describe('validateInquiry', () => {
  it('passes a form with only the required answers', () => {
    expect(validateInquiry(GOOD)).toEqual({})
  })

  it('names every required field of an empty form, in the order the form shows them', () => {
    const errors = validateInquiry(EMPTY_INQUIRY)
    expect(errors).toEqual({
      name: 'required',
      email: 'required',
      company: 'required',
      volume: 'chooseOne',
      uses: 'chooseAny',
      message: 'required',
      consent: 'consent',
    })
    expect(FIELD_ORDER.filter((field) => errors[field])).toEqual(['name', 'email', 'company', 'volume', 'uses', 'message', 'consent'])
  })

  it('counts a blank-only answer as empty', () => {
    expect(fieldError('name', { ...GOOD, name: '   ' })).toBe('required')
  })

  it('checks the email, the 10–1,000 character message and the length caps', () => {
    expect(fieldError('email', { ...GOOD, email: 'lin@example' })).toBe('email')
    expect(fieldError('email', { ...GOOD, email: ' lin@example.com ' })).toBeNull()
    expect(fieldError('message', { ...GOOD, message: 'too short' })).toBe('tooShort')
    expect(fieldError('message', { ...GOOD, message: 'x'.repeat(1001) })).toBe('tooLong')
    expect(fieldError('message', { ...GOOD, message: '每月三百张白底商品图片' })).toBeNull()
    expect(fieldError('company', { ...GOOD, company: 'x'.repeat(201) })).toBe('tooLong')
  })

  it('leaves optional fields alone when empty, and checks them when filled', () => {
    expect(fieldError('phone', GOOD)).toBeNull()
    expect(fieldError('phone', { ...GOOD, phone: '+86 138-0013-8000' })).toBeNull()
    expect(fieldError('phone', { ...GOOD, phone: '+1 (415) 555 0132' })).toBeNull()
    expect(fieldError('phone', { ...GOOD, phone: '13800138000' })).toBe('phone')
    expect(fieldError('website', { ...GOOD, website: 'acme.com' })).toBeNull()
    expect(fieldError('website', { ...GOOD, website: 'https://shop123.taobao.com/shop/view?id=1' })).toBeNull()
    expect(fieldError('website', { ...GOOD, website: '品牌.中国' })).toBeNull()
    expect(fieldError('website', { ...GOOD, website: 'javascript:alert(1)' })).toBe('website')
    expect(fieldError('website', { ...GOOD, website: 'my shop' })).toBe('website')
    expect(fieldError('wechat', { ...GOOD, wechat: 'x'.repeat(65) })).toBe('tooLong')
  })
})

describe('inquiryShape (the post, before validation)', () => {
  it('fills what is missing with empty answers and drops repeated choices', () => {
    const parsed = inquiryShape.parse({ name: 'A', uses: ['ads', 'ads'] })
    expect(parsed.uses).toEqual(['ads'])
    expect(parsed.platforms).toEqual([])
    expect(parsed.volume).toBe('')
    expect(parsed.consent).toBe(false)
  })

  it('refuses unknown choices and unknown keys', () => {
    expect(inquiryShape.safeParse({ volume: 'lots' }).success).toBe(false)
    expect(inquiryShape.safeParse({ platforms: ['myspace'] }).success).toBe(false)
    expect(inquiryShape.safeParse({ status: 'won' }).success).toBe(false)
    expect(inquiryShape.safeParse({ name: 'x'.repeat(5000) }).success).toBe(false)
  })
})
