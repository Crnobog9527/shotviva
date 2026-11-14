import { describe, expect, it } from 'vitest'

import { posterContentSchema } from '../poster/content'
import { copyConflicts, fillCopy, fillPoster, matchesStore, storeCopyValues } from './fill'
import { contactLine, storeTextSchema } from './profile'

const store = { name: '星澜棋牌', nameEn: 'Xinglan', phones: ['138 0000 0000', '021-1234'], address: '静安区 1 号', wechat: 'xinglan01' }

const prizeFields = [
  { key: 'venue', maxLength: 30 }, { key: 'venue_en', maxLength: 40 }, { key: 'title', maxLength: 30 },
  { key: 'address', maxLength: 60 }, { key: 'contact', maxLength: 20 },
]

describe('store details on plain copy fields', () => {
  it('fills the fields it knows, cut to their length', () => {
    expect(matchesStore(prizeFields)).toBe(true)
    expect(matchesStore([{ key: 'title' }])).toBe(false)
    expect(storeCopyValues(prizeFields, store)).toEqual({ venue: '星澜棋牌', venue_en: 'Xinglan', address: '静安区 1 号', contact: '138 0000 0000 / 021-'.slice(0, 20) })
    expect(contactLine(store)).toBe('138 0000 0000 / 021-1234 / xinglan01')
  })

  it('fills only empty fields unless forced, and names what a forced fill would replace', () => {
    const values = storeCopyValues(prizeFields, store)
    const copy = { venue: '我的店', title: '周赛', address: '  ' }
    expect(fillCopy(copy, values)).toEqual({ copy: { ...copy, venue_en: 'Xinglan', address: '静安区 1 号', contact: values.contact }, changed: ['venue_en', 'address', 'contact'] })
    expect(copyConflicts(copy, values)).toEqual(['venue'])
    expect(fillCopy(copy, values, true).copy.venue).toBe('星澜棋牌')
  })
})

describe('store details on a dense-text poster', () => {
  const content = posterContentSchema.parse({ header: { brand: '示例棋牌' }, footer: { phones: [], address: '示例地址' } })

  it('fills empty fields, and sample ones when allowed', () => {
    const plain = fillPoster(content, store)
    expect(plain.changed).toEqual(['header.brandEn', 'footer.phones'])
    expect(plain.content.footer.phones).toEqual(store.phones)
    expect(plain.content.header.brand).toBe('示例棋牌')
    const sample = fillPoster(content, store, () => true)
    expect(sample.changed).toEqual(['header.brand', 'header.brandEn', 'footer.phones', 'footer.address'])
    expect(sample.content.footer.address).toBe('静安区 1 号')
  })
})

describe('storeTextSchema', () => {
  it('drops empty phone boxes and refuses values past their limit', () => {
    expect(storeTextSchema.parse({ ...store, phones: ['', ' 138 ', ''], autofill: true }).phones).toEqual(['138'])
    expect(storeTextSchema.safeParse({ ...store, name: '店'.repeat(25), autofill: true }).success).toBe(false)
    expect(storeTextSchema.safeParse({ ...store, phones: ['1', '2', '3', '4'], autofill: true }).success).toBe(false)
  })
})
