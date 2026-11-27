import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'

import { Rates } from './rates'

it('labels an enterprise account\'s level-2 column and states each kind\'s org default a blank field falls back to', () => {
  const html = renderToStaticMarkup(createElement(Rates, { optional: true, orgL2Defaults: { pack: 500, monthly: 500, yearly: 300 } }))
  expect(html).toContain('企业二级（%）')
  expect(html).toContain('积分包 5%、月付 5%、年付 3%')
  expect(html).toContain('placeholder="默认 3"')
  expect(html).not.toContain('团队奖励（%）')
  expect(html).not.toContain('企业二级默认（%）')
})
it('keeps the personal labels without the org default', () => {
  const html = renderToStaticMarkup(createElement(Rates, { optional: true }))
  expect(html).toContain('团队奖励（%）')
  expect(html).not.toContain('企业')
})
it('edits the three org level-2 defaults beside the program rates in the settings form', () => {
  const values = [{ product_kind: 'yearly', l1_bp: 1000, l2_bp: 300, org_l2_bp: 300 }]
  const html = renderToStaticMarkup(createElement(Rates, { values, editOrgL2: true }))
  expect(html).toContain('团队奖励（%）')
  expect(html.match(/企业二级默认（%）/g)).toHaveLength(3)
  expect(html).toMatch(/name="yearly_org_l2"[^>]*value="3"|value="3"[^>]*name="yearly_org_l2"/)
})
