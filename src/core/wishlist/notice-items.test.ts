import { describe, expect, it } from 'vitest'

import { afterDismiss, toNoticeItems } from './notice-items'
import type { WishNotice } from './notices'

const row = (patch: Partial<WishNotice> = {}): WishNotice => ({
  request_id: '00000000-0000-4000-8000-000000000106',
  template_id: 'flowers',
  template_name_en: 'Flowers',
  template_name_zh: '鲜花',
  description_excerpt: '花',
  is_author: true,
  ...patch,
})

describe('toNoticeItems', () => {
  it('keeps the order and picks the name for the page language', () => {
    const rows = [row(), row({ request_id: '00000000-0000-4000-8000-000000000107', is_author: false })]
    expect(toNoticeItems(rows, 'zh')).toEqual([
      { requestId: rows[0].request_id, templateId: 'flowers', templateName: '鲜花', isAuthor: true },
      { requestId: rows[1].request_id, templateId: 'flowers', templateName: '鲜花', isAuthor: false },
    ])
    expect(toNoticeItems(rows, 'en')[0].templateName).toBe('Flowers')
  })

  it('falls back to the English name when the Chinese one is blank', () => {
    expect(toNoticeItems([row({ template_name_zh: '' })], 'zh')[0].templateName).toBe('Flowers')
  })
})

describe('afterDismiss', () => {
  it('steps to the next notice, then ends', () => {
    expect(afterDismiss(0, 3)).toBe(1)
    expect(afterDismiss(1, 3)).toBe(2)
    expect(afterDismiss(2, 3)).toBeNull()
    expect(afterDismiss(0, 1)).toBeNull()
    expect(afterDismiss(null, 3)).toBeNull()
  })
})
