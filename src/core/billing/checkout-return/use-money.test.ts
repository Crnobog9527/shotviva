import { NextIntlClientProvider } from 'next-intl'
import { createElement, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { useChargedMoney } from './use-money'

function Amount({ minor }: { minor: number }) {
  return useChargedMoney()({ minor, currency: 'usd' })
}

function render(locale: 'en' | 'zh', minor: number) {
  const props: ComponentProps<typeof NextIntlClientProvider> = { locale, messages: {}, children: createElement(Amount, { minor }) }
  return renderToStaticMarkup(createElement(NextIntlClientProvider, props))
}

// The checkout return page writes the charged amount like the paywall: "$", never "US$" (T49).
describe('charged amount', () => {
  it('reads $49.90 and $99 in both languages', () => {
    for (const locale of ['en', 'zh'] as const) {
      expect(render(locale, 4990)).toBe('$49.90')
      expect(render(locale, 9900)).toBe('$99')
    }
  })
})
