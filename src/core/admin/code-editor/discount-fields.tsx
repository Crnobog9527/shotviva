'use client'

import { useState } from 'react'
import type { ProductId } from '../../config'
import { Input } from '../../ui/input'
import { COPY } from './copy'
import { type Catalog, type Duration, type Existing } from './model'
import { ProductPicker } from './product-picker'

type Props = { prices: Catalog; code: Existing; locked: boolean; percent: string; setPercent: (v: string) => void;
  chosen: ProductId[]; setChosen: (ids: ProductId[]) => void; error: string | null }

export function DiscountFields({ prices, code, locked, percent, setPercent, chosen, setChosen, error }: Props) {
  const [period, setPeriod] = useState<Duration>(code.discount_duration ?? 'once')
  return <fieldset className="grid gap-4 rounded-lg border bg-card p-4" disabled={locked}>
    <legend className="px-1 font-semibold">{COPY.discount}</legend>
    {locked && <p className="text-sm text-muted-foreground">{COPY.immutable}</p>}
    <label className="grid gap-1">{COPY.percent}<Input type="number" name="percent" min={1} max={90} required
      value={percent} onChange={e => setPercent(e.target.value)} /></label>
    <ProductPicker prices={prices} percent={Number(percent)} chosen={chosen} change={setChosen} locked={locked} />
    {error && <p role="status" className="text-sm text-destructive">{error}</p>}
    <label className="grid gap-1">{COPY.period}
      <select name="period" className="h-9 rounded-md border border-input bg-background px-2" value={period}
        onChange={e => setPeriod(e.target.value as Duration)}>
        {(['once','repeating','forever'] as const).map(d => <option key={d} value={d}>{COPY[d]}</option>)}</select></label>
    {period === 'repeating' && <label className="grid gap-1">{COPY.months}<Input name="months" type="number" min={1}
      defaultValue={code.discount_months ?? ''} required /></label>}
    <label className="grid gap-1">{COPY.days}<Input name="days" type="number" min={1} defaultValue={code.discount_valid_days ?? ''} /></label>
  </fieldset>
}
