import type { ProviderPrices } from '@/core/jobs'
import { effectivePrices } from '@/core/jobs/model-prices'
import type { ProviderModule } from '@/core/providers/types'

import { PROVIDERS_COPY as COPY } from './copy'
import { missingPrices, pricesFromTable } from './form-state'

const price = (value: number | null) => (value === null ? COPY.priceUnset : `$${value}`)

type Props = { prices: ProviderPrices; module: ProviderModule; model: string }

// The prices the module's jobs are costed with: the row's own, empty ones from the official price
// table (§10.0). Red with a warning when one it needs is in neither.
export function PricesCell({ prices, module, model }: Props) {
  const shown = effectivePrices(model, prices) ?? prices
  const missing = missingPrices(prices, module, model)
  const fromTable = pricesFromTable(prices, module, model)
  const text =
    module === 'decision'
      ? COPY.decisionPrices(price(shown.inputTextPerM), price(shown.outputPerM))
      : COPY.prices(price(shown.inputTextPerM), price(shown.inputImagePerM), price(shown.outputPerM))
  return (
    <div className={`w-52 text-xs whitespace-normal ${missing ? 'text-destructive' : ''}`}>
      <div className="font-mono">{text}</div>
      {fromTable ? <div className="text-muted-foreground">{COPY.pricesFromTable(fromTable)}</div> : null}
      {missing ? <div role="note">{COPY.pricesMissing}</div> : null}
    </div>
  )
}
