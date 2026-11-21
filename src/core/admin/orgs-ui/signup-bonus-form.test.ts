import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'

import { SignupBonusForm } from './signup-bonus-form'

const org = {
  id: '11111111-1111-4111-8111-111111111111', name: 'Acme Test', refCode: 'SV-K7M2PX', ownerUserId: 'u', status: 'active' as const, concurrency: null, perWindow: null,
  batchZip: false, batchMax: null, multiTemplateMax: null, earlyFeatures: false, affiliateEnabled: true, affiliateLevels: 1 as const,
  signupBonusCredits: 300, poolCredits: 0, adminNote: null, createdAt: 'x', updatedAt: '2026-01-01T00:00:00Z',
}

it('shows the field with its current value, the cap, the level-1-only rule and how many users got it', () => {
  const html = renderToStaticMarkup(createElement(SignupBonusForm, { org, max: 1000, given: 7, save: vi.fn() }))
  for (const text of ['通过本企业邀请链接注册的新用户额外赠送免费积分', 'value="300"', '最多 1000', '二级客户不送', '已有 7 位新用户领到']) {
    expect(html).toContain(text)
  }
})
