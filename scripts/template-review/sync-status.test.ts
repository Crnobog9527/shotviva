import { expect, it } from 'vitest'

import { syncState } from './sync-status'

const runs = [
  { title: 'Sync templates cn-pale-window, wd-dappled-slate', at: '2026-11-11T18:16:52Z' },
  { title: 'Sync templates  series dinner-set', at: '2026-11-12T08:00:00Z' },
  { title: 'Sync templates cn-pale-window', at: '2026-11-11T13:58:49Z' },
]

it('compares the last sync naming a template or its series with the last change on the test site', () => {
  expect(syncState('wd-dappled-slate', null, '2026-11-11T10:00:00Z', runs)).toBe('已同步')
  expect(syncState('wd-dappled-slate', null, '2026-11-12T01:00:00Z', runs)).toBe('测试站更新了')
  expect(syncState('cn-pale-window', null, '2026-11-11T15:00:00Z', runs)).toBe('已同步')
  expect(syncState('member', 'dinner-set', '2026-11-12T07:00:00Z', runs)).toBe('已同步')
  expect(syncState('wd-dappled', null, null, runs)).toBe('未同步')
  expect(syncState('qa-t60-c', null, null, [])).toBe('未同步')
  expect(syncState('qa-t60-c', null, null, null)).toBe('无法确认')
})
