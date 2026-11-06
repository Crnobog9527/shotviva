import type { ProviderPrices } from '@/core/jobs'
import type { ProviderModule } from '@/core/providers/types'

import { PROVIDERS_COPY as COPY } from './copy'
import { missingPrices } from './form-state'

const price = (value: number | null) => (value === null ? COPY.priceUnset : `$${value}`)

// The module's per-million prices; red with a warning when one it needs is missing (§10.0).
export function PricesCell({ prices, module }: { prices: ProviderPrices; module: ProviderModule }) {
  const missing = missingPrices(prices, module)
  const text =
    module === 'decision'
      ? COPY.decisionPrices(price(prices.inputTextPerM), price(prices.outputPerM))
      : COPY.prices(price(prices.inputTextPerM), price(prices.inputImagePerM), price(prices.outputPerM))
  return (
    <div className={`max-w-56 text-xs ${missing ? 'text-destructive' : ''}`}>
      <div className="font-mono">{text}</div>
      {missing ? <div role="note">{COPY.pricesMissing}</div> : null}
    </div>
  )
}
