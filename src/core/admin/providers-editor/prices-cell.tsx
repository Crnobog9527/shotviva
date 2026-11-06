import type { ProviderPrices } from '@/core/jobs'

import { PROVIDERS_COPY as COPY } from './copy'
import { missingPrices } from './form-state'

const price = (value: number | null) => (value === null ? COPY.priceUnset : `$${value}`)

// The three per-million prices; red with a warning when any is missing (ARCHITECTURE §10.0).
export function PricesCell({ prices }: { prices: ProviderPrices }) {
  const missing = missingPrices(prices)
  return (
    <div className={`max-w-56 text-xs ${missing ? 'text-destructive' : ''}`}>
      <div className="font-mono">{COPY.prices(price(prices.inputTextPerM), price(prices.inputImagePerM), price(prices.outputPerM))}</div>
      {missing ? <div role="note">{COPY.pricesMissing}</div> : null}
    </div>
  )
}
