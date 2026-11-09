'use client'

import { Input } from '@/core/ui/input'
import { Label } from '@/core/ui/label'
import { RESOLUTIONS } from '@/core/templates/output-options'
import { TEMPLATE_QUALITIES, type CreditsFloor, type TemplateQuality } from '@/core/templates/pricing'

import { creditProblems, TIER_LABEL, type TemplateFormValues } from './form-state'

type Props = {
  values: TemplateFormValues
  floor: CreditsFloor
  onChange: (patch: Partial<TemplateFormValues>) => void
}

const QUALITY_LABEL: Record<TemplateQuality, string> = { high: 'high（默认）', medium: 'medium（实测效果够用才降档）' }

// Quality tier + one credit number per resolution (ARCHITECTURE §5, §10). Each box shows its
// floor; a number under it is flagged here and refused again by the server.
export function TemplatePriceFields({ values, floor, onChange }: Props) {
  const problems = creditProblems(values, floor)
  return (
    <div className="grid gap-3 rounded-md border p-3">
      <div className="grid gap-1.5">
        <Label htmlFor="tpl-quality">质量档（送给模型的 quality）</Label>
        <select
          id="tpl-quality"
          className="border-input h-9 rounded-md border bg-transparent px-3 text-sm"
          value={values.quality}
          onChange={(event) => onChange({ quality: event.target.value as TemplateQuality })}
        >
          {TEMPLATE_QUALITIES.map((quality) => (
            <option key={quality} value={quality}>
              {QUALITY_LABEL[quality]}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {RESOLUTIONS.map((resolution) => (
          <div key={resolution} className="grid gap-1.5">
            <Label htmlFor={`tpl-credits-${resolution}`}>{`${TIER_LABEL[resolution]} 积分`}</Label>
            <Input
              id={`tpl-credits-${resolution}`}
              inputMode="numeric"
              aria-invalid={problems[resolution] ? true : undefined}
              value={values.credits[resolution]}
              onChange={(event) => onChange({ credits: { ...values.credits, [resolution]: event.target.value } })}
            />
            <p className={problems[resolution] ? 'text-destructive text-xs' : 'text-muted-foreground text-xs'}>
              {problems[resolution] ?? `建议积分 ≥ ${floor[values.quality][resolution]}`}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
