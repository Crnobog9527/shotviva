import { effectivePrices } from '@/core/jobs/catalog-price'
import { currentCatalogPrice } from '@/core/providers/catalog-model'
import { isTextModule } from '@/core/providers/types'

import type { AdminProvider } from '../providers/types'

import { PROVIDERS_COPY as COPY } from './copy'
import { missingPrices, pricedFromCatalog } from './form-state'

const price = (value: number | null) => (value === null ? COPY.priceUnset : `$${value}`)

type Props = { provider: Pick<AdminProvider, 'adapter' | 'baseUrl' | 'model' | 'module' | 'prices' | 'catalogPrice'> }

// The prices the module's jobs are costed with: the OpenRouter catalogue's, else the admin's own
// (§10.0). Red with a warning when one it needs is in neither.
export function PricesCell({ provider }: Props) {
  const shown = effectivePrices(currentCatalogPrice(provider), provider.prices) ?? provider.prices
  const priceModule = provider.adapter === 'openrouter_images' || isTextModule(provider.module) ? 'decision' : provider.module
  const missing = missingPrices(provider, priceModule)
  const catalog = pricedFromCatalog(provider, priceModule)
  const text =
    priceModule === 'decision'
      ? COPY.decisionPrices(price(shown.inputTextPerM), price(shown.outputPerM))
      : COPY.prices(price(shown.inputTextPerM), price(shown.inputImagePerM), price(shown.outputPerM))
  return (
    <div className={`w-52 text-xs whitespace-normal ${missing ? 'text-destructive' : ''}`}>
      <div className="font-mono">{text} · {COPY.tokenUnit}</div>
      {catalog ? <div className="text-muted-foreground">{COPY.pricesFromCatalog(catalog.fetchedAt.slice(0, 10))}</div> : null}
      {missing ? <div role="note">{provider.adapter === 'openrouter_images' ? COPY.fallbackPricesMissing : COPY.pricesMissing}</div> : null}
    </div>
  )
}

const megapixels = (pixels: number) => Number((pixels / 1e6).toFixed(2))

// Ark rows bill per image from their admin-entered list price (yuan), converted at CNY_PER_USD.
export function ArkPricesCell({ listPrice }: Pick<AdminProvider, 'listPrice'>) {
  if (!listPrice) return <div role="note" className="text-destructive w-52 text-xs whitespace-normal">{COPY.arkPriceMissing}</div>
  const bands = listPrice.outputBands.map((band, index) => {
    const previous = listPrice.outputBands[index - 1]?.maxPixels
    const scope = band.maxPixels !== null ? COPY.arkBandUpTo(megapixels(band.maxPixels)) : previous ? COPY.arkBandAbove(megapixels(previous)) : COPY.arkBandAll
    return `${scope} ¥${band.cny}`
  }).join(' · ')
  return (
    <div className="w-52 text-xs whitespace-normal">
      <div className="font-mono">{COPY.arkPriceLine(bands, listPrice.inputImageCny)}</div>
      <div className="text-muted-foreground">{COPY.arkPriceAsOf(listPrice.asOf, listPrice.source)}</div>
    </div>
  )
}
