import { describe, expect, it } from 'vitest'

import type { AdminInquiry } from '@/core/inquiries'

import { csvCell, inquiriesCsv } from './inquiries-csv'

const row: AdminInquiry = {
  id: '3f2b8c1e-9a4d-4e7b-8c21-5d6f7a8b9c0d',
  created_at: '2026-11-13T02:00:00Z',
  updated_at: '2026-11-13T03:00:00Z',
  company: 'Acme "Foods"',
  name: '=HYPERLINK("x")',
  email: 'ann@example.com',
  monthly_volume: '500_2000',
  uses: ['ecommerce', 'social'],
  status: 'contacted',
  locale: 'zh',
  page: '/zh/pricing',
  user_id: null,
  message: 'Line one\nline two',
  job_title: null,
  website: null,
  wechat: null,
  phone: '+8613800000000',
  team_size: '6_20',
  country: null,
  platforms: [],
  needs: ['api'],
  start_time: 'asap',
  admin_note: null,
}

describe('inquiry CSV', () => {
  it('quotes every cell, doubles quotes and defuses formulas', () => {
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('=1+1')).toBe(`"'=1+1"`)
    expect(csvCell('-cmd')).toBe(`"'-cmd"`)
    expect(csvCell(null)).toBe('""')
  })

  it('writes a BOM, a header row and one row per inquiry in Chinese words and Beijing time', () => {
    const csv = inquiriesCsv([row])
    expect(csv.startsWith('﻿"提交时间","状态","公司或品牌"')).toBe(true)
    const lines = csv.slice(1).split('\r\n')
    expect(lines).toHaveLength(3)
    expect(lines[1]).toContain('"2026-11-13 10:00","已联系","Acme ""Foods"""')
    expect(lines[1]).toContain(`"'=HYPERLINK(""x"")"`)
    expect(lines[1]).toContain('"电商商品图、社交媒体内容"')
    expect(lines[1]).toContain(`"'+8613800000000"`)
    expect(lines[1]).toContain('"Line one\nline two"')
  })
})
