'use client'

import { Checkbox } from '@/core/ui/checkbox'
import { Label } from '@/core/ui/label'
import { OUTPUT_ASPECTS, RESOLUTIONS, type OutputAspect, type Resolution } from '@/core/templates/output-options'

import { ASPECT_LABEL, RESOLUTION_LABEL, TEST_RUN_COPY as COPY } from './copy'

const SELECT = 'border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm'

export type RunOptionValues = { resolution: Resolution | ''; aspect: OutputAspect | ''; triple: boolean }

type Props = {
  id: string
  values: RunOptionValues
  onChange: (patch: Partial<RunOptionValues>) => void
  // Edits may keep the source's own tier and size ('' = "和原图一样").
  sameLabel?: string
  // Shown only when one target can run three times (planBatch).
  tripleAvailable: boolean
}

// 清晰度、尺寸、一次跑 3 张: the workspace's own choices (DESIGN §4.3), in the admin's words.
export function RunOptions({ id, values, onChange, sameLabel, tripleAvailable }: Props) {
  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-resolution`}>{COPY.options.resolution}</Label>
        <select id={`${id}-resolution`} className={SELECT} value={values.resolution} onChange={(event) => onChange({ resolution: event.target.value as Resolution | '' })}>
          {sameLabel ? <option value="">{sameLabel}</option> : null}
          {RESOLUTIONS.map((tier) => (
            <option key={tier} value={tier}>
              {RESOLUTION_LABEL[tier]}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-aspect`}>{COPY.options.aspect}</Label>
        <select id={`${id}-aspect`} className={SELECT} value={values.aspect} onChange={(event) => onChange({ aspect: event.target.value as OutputAspect | '' })}>
          {sameLabel ? <option value="">{sameLabel}</option> : null}
          {OUTPUT_ASPECTS.map((aspect) => (
            <option key={aspect} value={aspect}>
              {ASPECT_LABEL[aspect] ?? aspect}
            </option>
          ))}
        </select>
      </div>
      <label className="flex h-9 items-center gap-2 text-sm whitespace-nowrap" aria-disabled={!tripleAvailable}>
        <Checkbox checked={tripleAvailable && values.triple} disabled={!tripleAvailable} onCheckedChange={(checked) => onChange({ triple: checked === true })} />
        {COPY.options.triple}
      </label>
    </div>
  )
}
