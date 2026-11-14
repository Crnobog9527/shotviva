import type { ProviderPrices } from '@/core/jobs'
import { arkPrice } from '@/core/jobs/ark-prices'
import { effectivePrices } from '@/core/jobs/model-prices'
import type { ProviderAdapterId, ProviderModule } from '@/core/providers/types'

import { PROVIDERS_COPY as COPY } from './copy'
import { missingPrices, pricesFromTable } from './form-state'

const price = (value: number | null) => (value === null ? COPY.priceUnset : `$${value}`)

type Props = { adapter: ProviderAdapterId; prices: ProviderPrices; module: ProviderModule; model: string }

// The prices the module's jobs are costed with: the row's own, empty ones from the official price
// table (§10.0). Red with a warning when one it needs is in neither.
export function PricesCell({ prices, module, model, adapter }: Props) {
  const shown = effectivePrices(model, prices) ?? prices
  const priceModule = adapter === 'openrouter_images' ? 'decision' : module
  const missing = missingPrices(prices, priceModule, model)
  const fromTable = pricesFromTable(prices, priceModule, model)
  const text =
    priceModule === 'decision'
      ? COPY.decisionPrices(price(shown.inputTextPerM), price(shown.outputPerM))
      : COPY.prices(price(shown.inputTextPerM), price(shown.inputImagePerM), price(shown.outputPerM))
  return (
    <div className={`w-52 text-xs whitespace-normal ${missing ? 'text-destructive' : ''}`}>
      <div className="font-mono">{text} · {COPY.tokenUnit}</div>
      {fromTable ? <div className="text-muted-foreground">{COPY.pricesFromTable(fromTable)}</div> : null}
      {missing ? <div role="note">{adapter === 'openrouter_images' ? COPY.fallbackPricesMissing : COPY.pricesMissing}</div> : null}
    </div>
  )
}

// Ark rows bill per image from the code price table (yuan), converted at CNY_PER_USD.
export function ArkPricesCell({ model }: { model: string }) {
  const entry = arkPrice(model)
  if (!entry) return <div role="note" className="text-destructive w-52 text-xs whitespace-normal">{COPY.arkPriceMissing}</div>
  const bands = entry.outputBands.map((band) => `≤${(band.maxPixels / 1e6).toFixed(2)}M 像素 ¥${band.cny}`).join(' · ')
  return (
    <div className="w-52 text-xs whitespace-normal">
      <div className="font-mono">{COPY.arkPriceLine(bands, entry.inputImageCny)}</div>
      <div className="text-muted-foreground">{COPY.arkPriceAsOf(entry.asOf, entry.source)}</div>
    </div>
  )
}
