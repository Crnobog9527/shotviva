import { Input } from '@/core/ui/input'
import { Label } from '@/core/ui/label'
import type { ProviderAdapterId } from '../providers/types'
import type { Resolution } from '@/core/templates/output-options'

import { PROVIDERS_COPY } from './copy'

const COPY = PROVIDERS_COPY.form

export function ImageCostFields({ adapter, tiers, values, estimates, onChange }: {
  adapter: ProviderAdapterId
  tiers: Resolution[]
  values: Partial<Record<Resolution, string>>
  estimates?: Partial<Record<Resolution, number>>
  onChange: (tier: Resolution, value: string) => void
}) {
  return <fieldset className="grid gap-2">
    <legend className="text-sm font-medium">{COPY.imageCosts}</legend>
    <p className="text-muted-foreground text-xs">{COPY.imageCostsHint(adapter)}</p>
    <div className="grid grid-cols-3 gap-2">
      {tiers.map((tier) => <div key={tier} className="grid gap-1">
        <Label htmlFor={`cost-${tier}`}>{tier.toUpperCase()}</Label>
        <Input id={`cost-${tier}`} inputMode="decimal" placeholder={estimates?.[tier] ? String(Number(estimates[tier].toPrecision(12))) : undefined} value={values[tier] ?? ''} onChange={(e) => onChange(tier, e.target.value)} />
      </div>)}
    </div>
  </fieldset>
}
