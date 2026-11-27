import { describe, expect, it } from 'vitest'

import type { FeatureSetting } from '../features/types'
import { overviewRows, type OverviewInput } from './overview'

const off = { enabled: false, updatedAt: null, updatedByEmail: null }
const on = { ...off, enabled: true }
const poster: FeatureSetting = { key: 'dense_poster', name: '赛事海报', minTier: null, openToAllAt: null, inviteOnly: false, invites: [] }
const input: OverviewInput = {
  signupPaused: off, food: off, posterGate: poster, photoCredits: 3, wishlist: on,
  gallery: { enabled: on, autoApprove: off }, serviceWorker: on, appShell: off, affiliate: true,
}

describe('功能开关 overview', () => {
  it('lists every switch in page order, each linking to its card', () => {
    expect(overviewRows(input).map((row) => [row.name, row.href])).toEqual([
      ['暂停注册赠送', '#signup_gift_paused'],
      ['餐饮模板「优化摆盘」「优化器皿」', '#food_toggles_enabled'],
      ['赛事海报 · 谁能用', '#feature-dense_poster'],
      ['拍照识别旧海报：每次扣多少积分', '#poster_photo_credits'],
      ['需求墙', '#wishlist_enabled'],
      ['公开创作库', '#gallery_enabled'],
      ['未被标记的作品自动通过', '#gallery_auto_approve'],
      ['手机离线缓存（Service Worker）', '#service_worker_enabled'],
      ['创作页秒开（App 外壳）', '#service_worker_shell_enabled'],
      ['联盟营销总开关', '/admin/affiliates'],
    ])
  })

  it('marks the five emergency switches', () => {
    expect(overviewRows(input).filter((row) => row.emergency).map((row) => row.href)).toEqual([
      '#signup_gift_paused', '#food_toggles_enabled', '#service_worker_enabled', '#service_worker_shell_enabled', '/admin/affiliates',
    ])
  })

  it('shows states in words and never the 拍照识别 price', () => {
    const rows = overviewRows({ ...input, signupPaused: on })
    const state = (href: string) => rows.find((row) => row.href === href)
    expect(state('#signup_gift_paused')).toMatchObject({ state: '已暂停', on: false })
    expect(state('#poster_photo_credits')?.state).toBe('已设置')
    expect(rows.map((row) => row.state).join()).not.toContain('3')
    expect(overviewRows({ ...input, photoCredits: null }).find((row) => row.href === '#poster_photo_credits')?.state).toBe('未设置（不提供）')
  })

  it('leaves out what the site does not have', () => {
    const hrefs = overviewRows({ ...input, wishlist: null, gallery: null, posterGate: null }).map((row) => row.href)
    expect(hrefs).not.toContain('#wishlist_enabled')
    expect(hrefs).not.toContain('#gallery_enabled')
    expect(hrefs).not.toContain('#feature-dense_poster')
  })
})
