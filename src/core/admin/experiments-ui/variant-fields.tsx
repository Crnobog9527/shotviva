'use client'

import type { SurfaceOption } from '../../experiments'
import { Button } from '@/core/ui/button'
import { Input } from '@/core/ui/input'

import { EXPERIMENTS_COPY } from './copy'
import { withControl, without, type VariantForm } from './form-state'

const COPY = EXPERIMENTS_COPY.form

type Props = {
  variants: VariantForm[]
  options: readonly SurfaceOption[]
  onChange: (variants: VariantForm[]) => void
}

// One row per variant: the code's option, a short name, a weight, and which one is the control.
export function VariantFields({ variants, options, onChange }: Props) {
  const set = (index: number, patch: Partial<VariantForm>) => onChange(variants.map((variant, at) => (at === index ? { ...variant, ...patch } : variant)))
  return (
    <fieldset className="grid gap-2 text-sm">
      <legend className="mb-1 font-medium">{COPY.variants}</legend>
      {variants.map((variant, index) => (
        <div key={index} className="grid grid-cols-[1fr] gap-2 rounded-md border p-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_5rem_auto_auto] sm:items-center">
          <select
            aria-label={COPY.option}
            className="h-9 rounded-md border border-input bg-transparent px-2"
            value={variant.optionId}
            onChange={(event) => set(index, { optionId: event.target.value })}
          >
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <Input aria-label={COPY.label} placeholder={COPY.label} maxLength={40} value={variant.label} onChange={(event) => set(index, { label: event.target.value })} />
          <Input aria-label={COPY.weight} type="number" min={0} max={100} value={variant.weight} onChange={(event) => set(index, { weight: event.target.value })} />
          <label className="flex items-center gap-1 whitespace-nowrap">
            <input type="radio" name="experiment-control" checked={variant.isControl} onChange={() => onChange(withControl(variants, index))} />
            {COPY.control}
          </label>
          <Button type="button" variant="ghost" size="sm" disabled={variants.length <= 2} onClick={() => onChange(without(variants, index))}>
            {COPY.remove}
          </Button>
        </div>
      ))}
    </fieldset>
  )
}
