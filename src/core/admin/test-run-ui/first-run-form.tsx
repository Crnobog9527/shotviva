'use client'

import { useState } from 'react'

import { ImageProviderField, type ImageProviderOption } from '@/core/admin/image-provider-field'
import { Button } from '@/core/ui/button'
import { Label } from '@/core/ui/label'
import { Textarea } from '@/core/ui/textarea'
import { FULL_IMAGE_OPTIONS, templateSizes } from '@/core/templates/image-options'
import { DEFAULT_RESOLUTION, NOTE_MAX_LENGTH } from '@/core/templates/output-options'

import type { AdminTemplate } from '../templates/types'
import type { TestPhotoView } from '../test-runs'
import { TEST_RUN_COPY as COPY } from './copy'
import { TestCopyFields } from './test-copy-fields'
import { firstRunLaunches } from './launches'
import { PhotoPicker } from './photo-picker'
import { RunOptions, type RunOptionValues } from './run-options'
import { planBatch } from './run-tree'
import { TestToggles } from './test-toggles'
import type { Launch } from './use-test-panel'

type Props = {
  providers: readonly ImageProviderOption[]
  template: AdminTemplate
  photos: readonly TestPhotoView[]
  onLaunch: (launches: Launch[]) => void
  onPhotoUploaded: () => void
  onNotice: (notice: string) => void
  onError: (message: string) => void
}

const noSizes = { aspects: [], resolutions: [], minReferences: 0 }

function trialSizes(providers: readonly ImageProviderOption[], id: string | null, templateRatios: readonly string[]) {
  const selected = providers.find(p => id ? p.id === id : p.isActive)
  if (!selected) return noSizes
  const stored = selected.capabilities ?? (selected.openAI ? FULL_IMAGE_OPTIONS : null)
  if (!stored) return noSizes
  const options = templateSizes(stored, selected.openAI, templateRatios)
  const aspects = options.originalRatio ? ['original' as const, ...options.aspectRatios] : options.aspectRatios
  return { aspects, resolutions: options.resolutions, minReferences: selected.capabilities?.minReferences ?? 0 }
}

function availableValue<T extends string>(wanted: T | '', values: readonly T[]): T | '' {
  return values.find(value => value === wanted) ?? values[0] ?? ''
}

function trialInputCount(template: AdminTemplate, targets: readonly string[], omitStyleRefs: boolean) {
  // Each selected test photo starts a separate run with the same saved styles.
  const photoCount = targets.length > 0 ? 1 : 0
  const styleCount = omitStyleRefs ? 0 : template.prompt?.styleRefs.length ?? 0
  return photoCount + styleCount
}

// 首次出图 (ARCHITECTURE §10.b): a test photo (or up to three), the template's own text fields,
// the optional note, size and tier, then one click that starts one or three runs.
export function FirstRunForm({ template, providers, photos, onLaunch, onPhotoUploaded, onError, onNotice }: Props) {
  const usesPhoto = template.fields.images.max > 0
  const [picked, setPicked] = useState<string[]>([])
  const [copy, setCopy] = useState<Record<string, string>>({})
  const [providerId, setProviderId] = useState(template.prompt?.providerId ?? null)
  const [omitStyleRefs, setOmitStyleRefs] = useState(false)
  const [note, setNote] = useState('')
  const [toggles, setToggles] = useState<Record<string, boolean>>({})
  const [wanted, setOptions] = useState<RunOptionValues>({ resolution: DEFAULT_RESOLUTION, aspect: 'original', triple: false })
  const sizes = trialSizes(providers, providerId, template.fields.aspectRatios)
  const options: RunOptionValues = {
    triple: wanted.triple,
    resolution: availableValue(wanted.resolution, sizes.resolutions),
    aspect: availableValue(wanted.aspect, sizes.aspects),
  }
  const targets = usesPhoto ? picked : []
  const belowMinimum = trialInputCount(template, targets, omitStyleRefs) < sizes.minReferences
  const count = planBatch(targets, options.triple).length
  const submit = () => {
    if (usesPhoto && template.fields.images.min > 0 && picked.length === 0) return onError(COPY.first.needPhoto)
    onLaunch(firstRunLaunches(template.id, targets, { providerId, copy, note, toggles, options, omitStyleRefs }))
  }
  return (
    <section aria-labelledby="test-first-title" className="grid gap-3 rounded-lg border p-3">
      <h3 id="test-first-title" className="text-sm font-semibold">
        {COPY.first.title}
      </h3>
      {usesPhoto ? (
        <PhotoPicker photos={photos} picked={picked} onPick={setPicked} onUploaded={onPhotoUploaded} onError={onError} onNotice={onNotice} />
      ) : (
        <p className="text-muted-foreground text-xs">{COPY.first.noPhotos}</p>
      )}
      <TestCopyFields fields={template.fields.copy} values={copy} onChange={setCopy} />
      <TestToggles toggles={template.fields.toggles ?? []} values={toggles} onChange={setToggles} />
      <div className="grid gap-1.5">
        <Label htmlFor="test-note">{COPY.first.note}</Label>
        <Textarea id="test-note" rows={2} maxLength={NOTE_MAX_LENGTH} placeholder={COPY.first.notePlaceholder} value={note} onChange={(event) => setNote(event.target.value)} />
      </div>
      <ImageProviderField id="test-image-provider" providers={providers} value={providerId} onChange={setProviderId} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={omitStyleRefs} onChange={event => setOmitStyleRefs(event.target.checked)} />
        {COPY.first.omitStyleRefs}
      </label>
      <RunOptions sizes={sizes} id="test-first" values={options} onChange={(patch) => setOptions((current) => ({ ...current, ...patch }))} tripleAvailable={targets.length <= 1} />
      {belowMinimum ? <p role="status" className="text-sm text-muted-foreground">{COPY.first.needInputs(sizes.minReferences)}</p> : null}
      <Button disabled={belowMinimum || !options.aspect || !options.resolution} onClick={submit} className="justify-self-start">
        {COPY.first.run(count)}
      </Button>
    </section>
  )
}
