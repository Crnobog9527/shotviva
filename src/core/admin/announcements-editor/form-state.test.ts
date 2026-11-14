import { describe, expect, it } from 'vitest'

import type { AdminAnnouncementRow } from '@/core/announcements/rules'

import { closeRuleOf, emptyForm, fromCloseRule, overlaps, statusOf, toForm, toIso, toLocal, toSaveInput, wouldStop } from './form-state'

const row = (id: string, starts: string | null, ends: string | null, active = true): AdminAnnouncementRow => ({
  id,
  message_en: id,
  message_zh: id,
  link_url: null,
  link_label_en: null,
  link_label_zh: null,
  tone: 'info',
  starts_at: starts,
  ends_at: ends,
  dismissible: true,
  reshow_after_days: 7,
  is_active: active,
  created_at: '2026-11-01T00:00:00Z',
  updated_at: '2026-11-01T00:00:00Z',
})

describe('announcement form state', () => {
  it('shows the two close columns as one choice and back', () => {
    expect(closeRuleOf(true, 7)).toBe('7')
    expect(closeRuleOf(true, null)).toBe('changed')
    expect(closeRuleOf(false, 7)).toBe('never')
    expect(fromCloseRule('30')).toEqual({ dismissible: true, reshowAfterDays: 30 })
    expect(fromCloseRule('changed')).toEqual({ dismissible: true, reshowAfterDays: null })
    expect(fromCloseRule('never')).toEqual({ dismissible: false, reshowAfterDays: null })
    expect(fromCloseRule('junk')).toEqual({ dismissible: true, reshowAfterDays: 7 })
  })

  it('defaults a new announcement to coming back 7 days after it is closed', () => {
    expect(emptyForm().closeRule).toBe('7')
    const input = toSaveInput({ ...toForm(row('a', null, null)), closeRule: 'never' }, 'a')
    expect(input).toMatchObject({ id: 'a', dismissible: false, reshowAfterDays: null })
    expect(input).not.toHaveProperty('closeRule')
  })

  it('reads datetime-local as Beijing time', () => {
    expect(toIso('2026-11-27T08:00')).toBe('2026-11-27T00:00:00.000Z')
    expect(toLocal('2026-11-27T00:00:00Z')).toBe('2026-11-27T08:00')
    expect(toIso('')).toBeNull()
  })

  it('overlaps like tstzrange: touching windows do not overlap, open ends do', () => {
    const a = row('a', '2026-11-01T00:00:00Z', '2026-11-10T00:00:00Z')
    expect(overlaps(a, row('b', '2026-11-10T00:00:00Z', null))).toBe(false)
    expect(overlaps(a, row('c', null, '2026-11-02T00:00:00Z'))).toBe(true)
    expect(overlaps(row('d', null, null), row('e', '2030-01-01T00:00:00Z', null))).toBe(true)
  })

  it('previews which active rows a switch would stop', () => {
    const target = row('t', '2026-11-27T00:00:00Z', '2026-12-01T00:00:00Z', false)
    const rows = [row('always', null, null), row('later', '2026-12-05T00:00:00Z', null), row('off', null, null, false)]
    expect(wouldStop(target, rows).map((r) => r.id)).toEqual(['always'])
  })

  it('labels live, scheduled, ended and off', () => {
    const now = Date.parse('2026-11-06T00:00:00Z')
    expect(statusOf(row('a', null, null), now)).toBe('live')
    expect(statusOf(row('b', '2026-11-27T00:00:00Z', null), now)).toBe('scheduled')
    expect(statusOf(row('c', null, '2026-11-01T00:00:00Z'), now)).toBe('ended')
    expect(statusOf(row('d', null, null, false), now)).toBe('off')
  })
})
