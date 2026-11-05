import { createTranslator } from 'next-intl'
import { describe, expect, it } from 'vitest'

import type { Translate } from '../translate'
import { balanceChipLabel, balanceSentence } from './balance-copy'

// core may not import site/, so this mirrors the app.balance messages; the real file is
// checked against the same cases in src/site/content/app-messages.test.ts.
const messages = {
  balance: {
    chipBoth: '{paid} + {free} free',
    chipFree: '{free} free',
    chipPaid: '{count, plural, one {# credit} other {# credits}}',
    none: 'You have 0 credits left.',
    both: 'You have {paid, plural, one {# credit} other {# credits}} and {free, plural, one {# free credit} other {# free credits}}.',
    free: 'You have {free, plural, one {# free credit} other {# free credits}}.',
    paid: 'You have {paid, plural, one {# credit} other {# credits}}.',
  },
}

const BALANCE_CASES = [
  [{ paid: 0, free: 6 }, '6 free', 'You have 6 free credits.'],
  [{ paid: 30, free: 0 }, '30 credits', 'You have 30 credits.'],
  [{ paid: 30, free: 6 }, '30 + 6 free', 'You have 30 credits and 6 free credits.'],
  [{ paid: 1, free: 1 }, '1 + 1 free', 'You have 1 credit and 1 free credit.'],
  [{ paid: 0, free: 0 }, '0 credits', 'You have 0 credits left.'],
] as const

describe('balance copy', () => {
  // Typed keys from the literal messages; helpers take the plain string-key shape.
  const t = createTranslator({ locale: 'en', messages, namespace: 'balance' }) as unknown as Translate
  it.each(BALANCE_CASES)('%o', (balance, chip, sentence) => {
    expect(balanceChipLabel(balance, t)).toBe(chip)
    expect(balanceSentence(balance, t)).toBe(sentence)
  })
})
