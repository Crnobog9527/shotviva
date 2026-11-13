'use client'

import { useEffect, useState, useTransition } from 'react'

import { creditMinimum, MISSING_COST, type CreditsCost, type CreditsFloor, type TemplateQuality } from '@/core/templates/pricing'
import { providerFloor, type ProviderFloors } from '@/core/templates/provider-pricing'
import { RESOLUTIONS, type Resolution } from '@/core/templates/output-options'
import type { StyleRef } from '@/core/templates/style-refs'
import { Button } from '@/core/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/core/ui/dialog'
import { Input } from '@/core/ui/input'
import { Textarea } from '@/core/ui/textarea'

import type { ActionValue } from '../templates'
import { profileCopy as copy } from './copy'
import { modelsFor, RESOLUTION_LABEL } from './labels'
import type { ImageModel, ProfileDetail, ProfileKey, ProfileTemplate, SaveProfileInput } from './types'

export type ProfileEditorActions = {
  detail: (input: { id: string; profile: ProfileKey }) => Promise<ActionValue<ProfileDetail | null>>
  save: (input: SaveProfileInput) => Promise<ActionValue<number>>
}

type Draft = {
  providerId: string | null; body: string; params: string; styleRefs: StyleRef[]
  quality: TemplateQuality; credits: CreditsCost; unpriced: Resolution[]
}
type Loaded = { draft: Draft; expected: number | null } | { message: string }

const selectClass = 'h-9 rounded-md border border-input bg-background px-2 text-sm'
const ARK_TIERS: readonly Resolution[] = ['1k', '2k']

function draftFrom(detail: ProfileDetail, profile: ProfileKey, models: readonly ImageModel[]): Draft {
  const choices = modelsFor(models, profile)
  const bound = choices.some(model => model.id === detail.providerId) ? detail.providerId : null
  const ark = profile === 'seedream'
  return {
    providerId: ark ? bound ?? choices[0]?.id ?? null : bound,
    body: detail.body, params: JSON.stringify(detail.modelParams, null, 2), styleRefs: detail.styleRefs,
    quality: ark ? 'medium' : detail.quality, credits: detail.creditsCost,
    unpriced: ark ? [...new Set([...detail.unpricedResolutions, '4k' as const])] : detail.unpricedResolutions,
  }
}

const failed = (result: ActionValue<unknown> | null) => ({ message: result?.ok === false ? result.message : copy.failed })

// A copy of the live profile, without its model (the other profile's family differs).
async function copyOfLive(actions: ProfileEditorActions, template: ProfileTemplate, profile: ProfileKey, models: readonly ImageModel[]): Promise<Loaded> {
  const live = await actions.detail({ id: template.id, profile: template.active }).catch(() => null)
  if (!live?.ok || !live.value) return failed(live)
  return { draft: draftFrom({ ...live.value, providerId: null }, profile, models), expected: null }
}

// The saved profile, or a copy of the live one when this profile does not exist yet.
async function loadDraft(actions: ProfileEditorActions, template: ProfileTemplate, profile: ProfileKey, models: readonly ImageModel[]): Promise<Loaded> {
  const own = await actions.detail({ id: template.id, profile }).catch(() => null)
  if (!own?.ok) return failed(own)
  if (own.value) return { draft: draftFrom(own.value, profile, models), expected: own.value.version }
  return copyOfLive(actions, template, profile, models)
}

function parseParams(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text || '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null
  } catch {
    return null
  }
}

function FloorHint({ min, below }: { min: number; below: boolean }) {
  if (min === MISSING_COST) return null
  return <span className={below ? 'text-destructive text-xs' : 'text-muted-foreground text-xs'}>{below ? copy.belowFloor : copy.floor(min)}</span>
}

function PriceField({ tier, draft, ark, floor, slots, set }: {
  tier: Resolution; draft: Draft; ark: boolean; floor: CreditsFloor; slots: number; set: (patch: Partial<Draft>) => void
}) {
  const unsupported = ark && !ARK_TIERS.includes(tier)
  const unpriced = unsupported || draft.unpriced.includes(tier)
  const min = creditMinimum(floor, draft.quality, tier, slots)
  return (
    <div className="grid gap-1">
      <span>{RESOLUTION_LABEL[tier]}</span>
      <Input type="number" min={1} max={999} className="w-24" disabled={unpriced} value={draft.credits[tier]}
        onChange={e => set({ credits: { ...draft.credits, [tier]: Math.max(1, Math.min(999, Number(e.target.value) || 1)) } })} />
      {unsupported ? <span className="text-muted-foreground text-xs">{copy.unsupported}</span> : <label className="flex items-center gap-1 text-xs">
        <input type="checkbox" checked={draft.unpriced.includes(tier)}
          onChange={e => set({ unpriced: e.target.checked ? [...draft.unpriced, tier] : draft.unpriced.filter(t => t !== tier) })} />
        {copy.unpriced}
      </label>}
      {!unpriced && <FloorHint min={min} below={draft.credits[tier] < min} />}
    </div>
  )
}

function DraftFields({ draft, set, profile, models, floors, template, onCopy, pending }: {
  draft: Draft; set: (patch: Partial<Draft>) => void; profile: ProfileKey; models: ImageModel[]
  floors: ProviderFloors; template: ProfileTemplate; onCopy: () => void; pending: boolean
}) {
  const ark = profile === 'seedream'
  const floor = providerFloor(floors, draft.providerId, template.id)
  return <>
    <div className="flex flex-wrap items-end gap-3">
      <label className="grid gap-1">{copy.model}
        <select className={selectClass} value={draft.providerId ?? ''} onChange={e => set({ providerId: e.target.value || null })}>
          {!ark && <option value="">{copy.followDefault}</option>}
          {modelsFor(models, profile).map(model => <option key={model.id} value={model.id}>{model.label}（{model.model}）</option>)}
        </select>
      </label>
      <label className="grid gap-1">{copy.quality}
        <select className={selectClass} value={draft.quality} disabled={ark} onChange={e => set({ quality: e.target.value as TemplateQuality })}>
          <option value="medium">medium</option>
          <option value="high">high</option>
        </select>
      </label>
      <Button variant="outline" disabled={pending} onClick={onCopy}>{copy.copyLive}</Button>
    </div>
    <label className="grid gap-1">{copy.body}
      <Textarea className="min-h-48 font-mono text-xs" value={draft.body} onChange={e => set({ body: e.target.value })} />
    </label>
    <label className="grid gap-1">{copy.params}
      <Textarea className="min-h-20 font-mono text-xs" value={draft.params} onChange={e => set({ params: e.target.value })} />
    </label>
    <p className="text-muted-foreground">{copy.refs(draft.styleRefs.length)}</p>
    <fieldset className="grid gap-2">
      <legend className="mb-1">{copy.credits}</legend>
      <div className="flex flex-wrap gap-4">
        {RESOLUTIONS.map(tier => <PriceField key={tier} tier={tier} draft={draft} ark={ark} floor={floor} slots={template.slots} set={set} />)}
      </div>
    </fieldset>
  </>
}

// Edits the profile that is not live (the live one is edited in the template editor).
export function ProfileEditor({ template, profile, models, floors, actions, onClose, onSaved }: {
  template: ProfileTemplate; profile: ProfileKey; models: ImageModel[]; floors: ProviderFloors
  actions: ProfileEditorActions; onClose: () => void; onSaved: () => void
}) {
  const [draft, setDraft] = useState<Draft | null>(null)
  const [expected, setExpected] = useState<number | null>(null)
  const [message, setMessage] = useState('')
  const [pending, run] = useTransition()

  function apply(loaded: Loaded, keepExpected = false) {
    if ('message' in loaded) { setMessage(loaded.message); return }
    setDraft(loaded.draft)
    if (!keepExpected) setExpected(loaded.expected)
  }

  useEffect(() => {
    let current = true
    void loadDraft(actions, template, profile, models).then(loaded => { if (current) apply(loaded) })
    return () => { current = false }
    // Loads once per template and profile (the dialog is keyed by both).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function save() {
    if (!draft) return
    const modelParams = parseParams(draft.params)
    if (!modelParams) { setMessage(copy.invalidJson); return }
    run(async () => {
      const result = await actions.save({
        id: template.id, profile, expected, providerId: draft.providerId, body: draft.body, modelParams,
        styleRefs: draft.styleRefs, quality: draft.quality, creditsCost: draft.credits, unpricedResolutions: draft.unpriced,
      }).catch(() => null)
      if (!result?.ok) { setMessage(result?.message ?? copy.failed); return }
      setExpected(result.value)
      setMessage(copy.saved)
      onSaved()
    })
  }

  const set = (patch: Partial<Draft>) => setDraft(prev => prev && { ...prev, ...patch })
  const savable = draft && draft.body.trim() && (profile !== 'seedream' || draft.providerId)
  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl" aria-describedby={undefined}>
        <DialogTitle>{copy[profile]} · {template.nameZh ?? template.name}</DialogTitle>
        {!draft ? <p className="text-muted-foreground text-sm" role="status">{message || copy.previewing}</p> : <div className="grid gap-4 text-sm">
          <DraftFields draft={draft} set={set} profile={profile} models={models} floors={floors} template={template} pending={pending}
            onCopy={() => run(async () => apply(await copyOfLive(actions, template, profile, models), true))} />
          {message && <p className="text-muted-foreground" role="status">{message}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>{copy.close}</Button>
            <Button disabled={pending || !savable} onClick={save}>{copy.save}</Button>
          </div>
        </div>}
      </DialogContent>
    </Dialog>
  )
}
