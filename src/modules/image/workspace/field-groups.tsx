'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { FoldSection } from '@/core/ui/fold-section'

import type { CatalogueCopyField, CatalogueFieldGroup, CatalogueImageSlot } from '../catalogue/catalogue-template'
import { groupState, initialOpen, type GroupState } from './field-group-state'
import { SlotBox, MissingSlotPhotos } from './slot-boxes'
import { CopyFields } from './text-fields'
import { clearCopy } from './copy-examples'
import { Button } from '@/core/ui/button'
import type { SlotPhotos } from './use-photo-batch'

type Props = {
  groups: readonly CatalogueFieldGroup[]
  fields: readonly CatalogueCopyField[]
  slots: readonly CatalogueImageSlot[]
  // Absent for a template without image slots.
  photos?: SlotPhotos
  copy: Record<string, string>
  onCopy(next: Record<string, string>): void
  // Make again whose photos could not come back (as SlotBoxes says it).
  missing?: 'old' | 'failed' | null
  // The form opened with the cover's text: values still equal to it are drawn greyer.
  examples?: boolean
}

type Shared = Pick<Props, 'fields' | 'slots' | 'photos' | 'copy' | 'onCopy' | 'examples'>

// The text fields a group holds, its blocks' included (清空本组 blanks these; photos stay).
const groupKeys = (group: CatalogueFieldGroup): string[] => group.items.flatMap((item) => (typeof item === 'string' ? [item] : item.items))

// A template's text fields and image slots in titled groups that fold (Owner 2026-11-14): the
// groups marked open (else the first) start open; each folded one says how far it is filled, and
// one holding a value the server would refuse stays open until it is fixed. Takes the place of SlotBoxes and
// the plain text fields for a template with fields.groups.
export function FieldGroups({ groups, missing = null, ...shared }: Props) {
  const t = useTranslations('app.workspace')
  const [open, setOpen] = useState<string[]>(() => initialOpen(groups))
  const photoKeys = new Set(Object.keys(shared.photos?.byKey ?? {}))
  const states = groups.map((group) => groupState(group, { fields: shared.fields, slots: shared.slots, copy: shared.copy, photos: photoKeys }))
  const toggle = (key: string) => setOpen((keys) => (keys.includes(key) ? keys.filter((item) => item !== key) : [...keys, key]))
  return (
    <div className="grid gap-3 pt-6">
      {missing ? <MissingSlotPhotos reason={missing} /> : null}
      {groups.map((group, i) => (
        <FoldSection key={group.key} id={`group-${group.key}`} title={group.label} open={open.includes(group.key) || (states[i]?.invalid ?? 0) > 0} onToggle={() => toggle(group.key)}
          summary={states[i] ? <GroupSummary state={states[i]} /> : null}>
          <div className="grid gap-4">
            {group.items.map((item) => (typeof item === 'string'
              ? <Member key={item} memberKey={item} {...shared} />
              : <Block key={item.key} block={item} {...shared} />))}
            <ClearGroup group={group} {...shared} />
          </div>
        </FoldSection>
      ))}
      {shared.slots.length > 0 ? <p className="text-caption text-muted-foreground">{t('slots.oneAtATime')}</p> : null}
    </div>
  )
}

// 清空本组: the group's text gone, its photos kept; only while some of its text is filled.
function ClearGroup({ group, fields, copy, onCopy }: Shared & { group: CatalogueFieldGroup }) {
  const t = useTranslations('app.workspace.examples')
  const keys = groupKeys(group).filter((key) => fields.some((field) => field.key === key))
  if (!keys.some((key) => copy[key]?.trim())) return null
  return (
    <div className="flex justify-end">
      <Button variant="ghost" size="sm" className="min-h-11 text-muted-foreground" onClick={() => onCopy(clearCopy(copy, keys))}>{t('clearGroup')}</Button>
    </div>
  )
}

function GroupSummary({ state }: { state: GroupState }) {
  const t = useTranslations('app.workspace.groups')
  if (state.invalid > 0) return <span className="text-destructive">{t('invalid')}</span>
  const filled = t('filled', { filled: state.filled, total: state.total })
  if (state.requiredMissing > 0) return <>{filled} · <span className="text-primary">{t('required', { count: state.requiredMissing })}</span></>
  return <>{filled}{state.filled > 0 ? <> · <span aria-label={t('done')}>✓</span></> : null}</>
}

// One thing's parts kept together, e.g. a prize: its name, its note, its photo.
function Block({ block, ...shared }: Shared & { block: Exclude<CatalogueFieldGroup['items'][number], string> }) {
  return (
    <div role="group" aria-labelledby={`block-${block.key}-h`} className="hairline grid gap-4 rounded-inner bg-wash-faint p-3">
      <h3 id={`block-${block.key}-h`} className="text-label leading-[1.3] font-semibold">{block.label}</h3>
      {block.items.map((key) => <Member key={key} memberKey={key} {...shared} />)}
    </div>
  )
}

// A text field or an image slot, by key.
function Member({ memberKey, fields, slots, photos, copy, onCopy, examples }: Shared & { memberKey: string }) {
  const field = fields.find((item) => item.key === memberKey)
  if (field) return <CopyFields fields={[field]} values={copy} onChange={onCopy} examples={examples} />
  const slot = slots.find((item) => item.key === memberKey)
  return slot && photos ? <SlotMember slot={slot} photos={photos} /> : null
}

function SlotMember({ slot, photos }: { slot: CatalogueImageSlot; photos: SlotPhotos }) {
  const t = useTranslations('app.workspace')
  return (
    <div>
      <p className="mb-2 flex items-baseline gap-2 text-label leading-[1.3] font-medium">
        {slot.label}
        {slot.required ? null : <span className="font-normal text-muted-foreground">{t('optional')}</span>}
      </p>
      <SlotBox slot={slot} photos={photos} />
      {slot.help ? <p className="mt-2 text-caption leading-[1.4] text-muted-foreground">{slot.help}</p> : null}
    </div>
  )
}
