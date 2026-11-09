'use client'

import { useState } from 'react'

import { ImageProviderField, type ImageProviderOption } from '@/core/admin/image-provider-field'
import { Button } from '@/core/ui/button'
import { Input } from '@/core/ui/input'
import { Label } from '@/core/ui/label'
import { Textarea } from '@/core/ui/textarea'
import { FULL_IMAGE_OPTIONS } from '@/core/templates/image-options'
import { DEFAULT_RESOLUTION, NOTE_MAX_LENGTH } from '@/core/templates/output-options'

import type { AdminTemplate } from '../templates/types'
import type { TestPhotoView } from '../test-runs'
import { TEST_RUN_COPY as COPY } from './copy'
import { firstRunLaunches } from './launches'
import { PhotoPicker } from './photo-picker'
import { RunOptions, type RunOptionValues } from './run-options'
import { TestToggles } from './test-toggles'
import type { Launch } from './use-test-panel'

type Props = {
  providers: readonly ImageProviderOption[]
  template: AdminTemplate
  photos: readonly TestPhotoView[]
  onLaunch: (launches: Launch[]) => void
  onPhotoUploaded: () => void
  onError: (message: string) => void
}

const noSizes = { aspects: [], resolutions: [] }

function trialSizes(providers: readonly ImageProviderOption[], id: string | null) {
  const selected = providers.find(p => id ? p.id === id : p.isActive)
  if (!selected) return noSizes
  const options = selected.capabilities ?? (selected.openAI ? FULL_IMAGE_OPTIONS : null)
  if (!options) return noSizes
  const aspects = options.originalRatio ? ['original' as const, ...options.aspectRatios] : options.aspectRatios
  return { aspects, resolutions: options.resolutions }
}

function availableValue<T extends string>(wanted: T | '', values: readonly T[]): T | '' {
  return values.find(value => value === wanted) ?? values[0] ?? ''
}

// 首次出图 (ARCHITECTURE §10.b): a test photo (or up to three), the template's own text fields,
// the optional note, size and tier, then one click that starts one or three runs.
export function FirstRunForm({ template, providers, photos, onLaunch, onPhotoUploaded, onError }: Props) {
  const usesPhoto = template.fields.images.max > 0
  const [picked, setPicked] = useState<string[]>([])
  const [copy, setCopy] = useState<Record<string, string>>({})
  const [providerId, setProviderId] = useState(template.prompt?.providerId ?? null)
  const [note, setNote] = useState('')
  const [toggles, setToggles] = useState<Record<string, boolean>>({})
  const [wanted, setOptions] = useState<RunOptionValues>({ resolution: DEFAULT_RESOLUTION, aspect: 'original', triple: false })
  const sizes = trialSizes(providers, providerId)
  const options: RunOptionValues = {
    triple: wanted.triple,
    resolution: availableValue(wanted.resolution, sizes.resolutions),
    aspect: availableValue(wanted.aspect, sizes.aspects),
  }
  const targets = usesPhoto ? picked : []
  const count = targets.length > 1 ? targets.length : options.triple ? 3 : 1
  const submit = () => {
    if (usesPhoto && template.fields.images.min > 0 && picked.length === 0) return onError(COPY.first.needPhoto)
    onLaunch(firstRunLaunches(template.id, targets, { providerId, copy, note, toggles, options }))
  }
  return (
    <section aria-labelledby="test-first-title" className="grid gap-3 rounded-lg border p-3">
      <h3 id="test-first-title" className="text-sm font-semibold">
        {COPY.first.title}
      </h3>
      {usesPhoto ? (
        <PhotoPicker photos={photos} picked={picked} onPick={setPicked} onUploaded={onPhotoUploaded} onError={onError} />
      ) : (
        <p className="text-muted-foreground text-xs">{COPY.first.noPhotos}</p>
      )}
      {template.fields.copy.map((field) => (
        <div key={field.key} className="grid gap-1.5">
          <Label htmlFor={`test-copy-${field.key}`}>
            {field.label}
            {field.required ? ' *' : ''}
          </Label>
          <Input
            id={`test-copy-${field.key}`}
            maxLength={field.maxLength}
            placeholder={field.placeholder}
            value={copy[field.key] ?? ''}
            onChange={(event) => setCopy((current) => ({ ...current, [field.key]: event.target.value }))}
          />
        </div>
      ))}
      <TestToggles toggles={template.fields.toggles ?? []} values={toggles} onChange={setToggles} />
      <div className="grid gap-1.5">
        <Label htmlFor="test-note">{COPY.first.note}</Label>
        <Textarea id="test-note" rows={2} maxLength={NOTE_MAX_LENGTH} placeholder={COPY.first.notePlaceholder} value={note} onChange={(event) => setNote(event.target.value)} />
      </div>
      <ImageProviderField id="test-image-provider" providers={providers} value={providerId} onChange={setProviderId} />
      <RunOptions sizes={sizes} id="test-first" values={options} onChange={(patch) => setOptions((current) => ({ ...current, ...patch }))} tripleAvailable={targets.length <= 1} />
      <Button disabled={!options.aspect || !options.resolution} onClick={submit} className="justify-self-start">
        {COPY.first.run(count)}
      </Button>
    </section>
  )
}
