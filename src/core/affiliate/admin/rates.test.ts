import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'

import { Rates } from './rates'

it('labels an enterprise account\'s level-2 column and states the org default a blank field falls back to', () => {
  const html = renderToStaticMarkup(createElement(Rates, { optional: true, orgL2DefaultBp: 500 }))
  expect(html).toContain('企业二级（%）')
  expect(html).toContain('企业默认 5%')
  expect(html).not.toContain('团队奖励（%）')
})
it('keeps the personal labels without the org default', () => {
  const html = renderToStaticMarkup(createElement(Rates, { optional: true }))
  expect(html).toContain('团队奖励（%）')
  expect(html).not.toContain('企业')
})
