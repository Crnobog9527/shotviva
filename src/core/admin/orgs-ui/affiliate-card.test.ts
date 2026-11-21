import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'

import { AffiliateCard } from './affiliate-card'

const affiliate = {
  userId: '00000000-0000-4000-8000-000000000001', slug: 'sv-test', status: 'active',
  rates: [
    { productKind: 'pack', l1Bp: 1500, l2Bp: 500, overridden: false },
    { productKind: 'yearly', l1Bp: 1250, l2Bp: 300, overridden: true },
  ],
}

it('shows the account status, the level-1 and level-2 rates and which are overridden', () => {
  const html = renderToStaticMarkup(createElement(AffiliateCard, { affiliate, levels: 2 }))
  for (const text of ['启用', 'sv-test', '15%', '5%', '12.5%', '3%', '单独设置', '默认', 'id=' + affiliate.userId]) expect(html).toContain(text)
})
it('hides the level-2 column when the org has one level, and explains a missing account', () => {
  expect(renderToStaticMarkup(createElement(AffiliateCard, { affiliate, levels: 1 }))).not.toContain('二级')
  expect(renderToStaticMarkup(createElement(AffiliateCard, { affiliate: null, levels: 1 }))).toContain('还没有企业联盟账号')
})
