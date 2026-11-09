import type { CatalogPricing, CatalogRate } from '@/core/templates/catalog-pricing'

import { PROVIDERS_COPY as COPY } from './copy'

function rateText(rate: CatalogRate) {
  const label = COPY.billingParts[rate.billable] ?? rate.billable
  const usd = rate.unit === 'token' ? rate.cost_usd * 1_000_000 : rate.cost_usd
  const unit = COPY.billingUnits[rate.unit] ?? rate.unit
  const variant = rate.variant ? ` (${rate.variant})` : ''
  return `${label}${variant} $${Number(usd.toPrecision(12))} / ${unit}`
}

export function CatalogPrices({ pricing }: { pricing?: CatalogPricing }) {
  if (!pricing || pricing.status !== 'quoted') {
    return <p className="text-muted-foreground text-xs">{pricing?.status === 'unavailable' ? COPY.priceUnavailable : COPY.noQuote}</p>
  }
  return <div className="space-y-1 text-xs">
    {pricing.endpoints.map((p, index) => (
      <div key={index}>
        <strong>{p.name}</strong>
        <div>{p.rates.map(rateText).join(' · ') || COPY.noQuote}</div>
        {p.rates.length > 0 && !p.rates.some(r => r.billable.startsWith('input')) && <div>{COPY.unknownInput}</div>}
      </div>
    ))}
  </div>
}
