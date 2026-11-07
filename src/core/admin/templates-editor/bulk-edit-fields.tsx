'use client'

import { Input } from '@/core/ui/input'
import { Label } from '@/core/ui/label'
import { RESOLUTIONS } from '@/core/templates/output-options'
import type { CreditsFloor } from '@/core/templates/pricing'

import type { BulkEditValues, SurfaceChoice } from './bulk-edit-state'
import { bulkEditCopy as COPY } from './copy'
import { TIER_LABEL } from './form-state'

const SELECT = 'border-input h-9 rounded-md border bg-transparent px-3 text-sm'

type Props = {
  values: BulkEditValues
  problems: Partial<Record<keyof BulkEditValues['credits'], string>>
  floor: CreditsFloor
  onChange: (values: BulkEditValues) => void
}

// The batch-edit form: three optional credit boxes, entry points, quality. Each starts on 不改.
export function BulkEditFields({ values, problems, floor, onChange }: Props) {
  return (
    <div className="grid gap-4">
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">{COPY.creditsLegend}</legend>
        <div className="grid grid-cols-3 gap-3">
          {RESOLUTIONS.map((resolution) => (
            <div key={resolution} className="grid gap-1.5">
              <Label htmlFor={`bulk-credits-${resolution}`}>{TIER_LABEL[resolution]}</Label>
              <Input
                id={`bulk-credits-${resolution}`}
                inputMode="numeric"
                placeholder="不改"
                aria-invalid={problems[resolution] ? true : undefined}
                value={values.credits[resolution]}
                onChange={(event) => onChange({ ...values, credits: { ...values.credits, [resolution]: event.target.value } })}
              />
              <p className={problems[resolution] ? 'text-destructive text-xs' : 'text-muted-foreground text-xs'}>
                {problems[resolution] ?? COPY.floorHint(floor.high[resolution], floor.medium[resolution])}
              </p>
            </div>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="bulk-surfaces">{COPY.surfaces}</Label>
          <select
            id="bulk-surfaces"
            className={SELECT}
            value={values.surfaces}
            onChange={(event) => onChange({ ...values, surfaces: event.target.value as SurfaceChoice })}
          >
            {Object.entries(COPY.surfaceOptions).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="bulk-quality">{COPY.quality}</Label>
          <select
            id="bulk-quality"
            className={SELECT}
            value={values.quality}
            onChange={(event) => onChange({ ...values, quality: event.target.value as BulkEditValues['quality'] })}
          >
            {Object.entries(COPY.qualityOptions).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}
