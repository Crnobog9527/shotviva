import { useFormatter } from 'next-intl'

import { majorUnits, type Money } from './view-model'

// "$49.90", "$99": the charged amount in its own currency; whole amounts without decimals, as
// the paywall writes prices, and "$" rather than "US$" in Chinese too (建站规格 G3).
export function useChargedMoney(): (money: Money) => string {
  const format = useFormatter()
  return (money) => {
    const amount = majorUnits(money)
    const digits = Number.isInteger(amount) ? 0 : 2
    return format.number(amount, { style: 'currency', currency: money.currency.toUpperCase(), currencyDisplay: 'narrowSymbol', minimumFractionDigits: digits, maximumFractionDigits: digits })
  }
}
