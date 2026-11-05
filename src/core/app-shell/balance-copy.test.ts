import { describe, expect, it } from 'vitest'

import { balanceChipLabel, balanceSentence } from './balance-copy'

describe('balance copy', () => {
  it.each([
    [{ paid: 0, free: 6 }, '6 free', 'You have 6 free credits.'],
    [{ paid: 30, free: 0 }, '30 credits', 'You have 30 credits.'],
    [{ paid: 30, free: 6 }, '30 + 6 free', 'You have 30 credits and 6 free credits.'],
    [{ paid: 1, free: 1 }, '1 + 1 free', 'You have 1 credit and 1 free credit.'],
    [{ paid: 0, free: 0 }, '0 credits', 'You have 0 credits left.'],
  ])('%o', (balance, chip, sentence) => {
    expect(balanceChipLabel(balance)).toBe(chip)
    expect(balanceSentence(balance)).toBe(sentence)
  })
})
