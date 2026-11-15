import { checkCopyValue } from '@/core/templates/copy-fields'

import type { CatalogueCopyField, CatalogueFieldGroup, CatalogueImageSlot } from '../catalogue/catalogue-template'

// What a folded group's summary line says (Owner 2026-11-14): how many of its parts are filled,
// how many required ones are still empty, and whether one holds a value the server would refuse
// (that group opens by itself, so the problem is never hidden behind a fold).
export type GroupState = { total: number; filled: number; requiredMissing: number; invalid: number }

export const groupMemberKeys = (group: Pick<CatalogueFieldGroup, 'items'>): string[] =>
  group.items.flatMap((item) => (typeof item === 'string' ? [item] : item.items))

type Inputs = {
  fields: readonly CatalogueCopyField[]
  slots: readonly CatalogueImageSlot[]
  copy: Readonly<Record<string, string>>
  // Slot keys that hold a photo.
  photos: ReadonlySet<string>
}

function refused(field: CatalogueCopyField, value: string): boolean {
  try {
    checkCopyValue({ ...field, options: field.options?.map((option) => option.value) }, value)
    return false
  } catch {
    return true
  }
}

function memberState(key: string, { fields, slots, copy, photos }: Inputs): { filled: boolean; missing: boolean; invalid: boolean } | null {
  const field = fields.find((item) => item.key === key)
  if (field) {
    const value = copy[key] ?? ''
    const filled = value.trim() !== ''
    return { filled, missing: field.required && !filled, invalid: filled && refused(field, value) }
  }
  const slot = slots.find((item) => item.key === key)
  if (!slot) return null
  const filled = photos.has(key)
  return { filled, missing: slot.required && !filled, invalid: false }
}

export function groupState(group: Pick<CatalogueFieldGroup, 'items'>, inputs: Inputs): GroupState {
  const states = groupMemberKeys(group).flatMap((key) => memberState(key, inputs) ?? [])
  return {
    total: states.length,
    filled: states.filter((state) => state.filled).length,
    requiredMissing: states.filter((state) => state.missing).length,
    invalid: states.filter((state) => state.invalid).length,
  }
}

// The groups open when the form starts: those marked open, else the first.
export function initialOpen(groups: readonly Pick<CatalogueFieldGroup, 'key' | 'open'>[]): string[] {
  const marked = groups.filter((group) => group.open).map((group) => group.key)
  return marked.length > 0 ? marked : groups.slice(0, 1).map((group) => group.key)
}

// A slot's name field: the text field keyed `<slot key>_name` (prize_1 ↔ prize_1_name), read from
// the template's fields, never its id, so any template that pairs a name with a photo slot gets it.
export const slotNameKey = (slotKey: string) => `${slotKey}_name`

// The slots among `keys` whose name is typed but whose photo is empty. With no photo the model
// draws the real product the name describes (Owner's rule; a photo always wins), and the form
// says so while this list is not empty. Nothing is blocked.
export function namedWithoutPhoto(keys: readonly string[], { fields, slots, copy, photos }: Inputs): string[] {
  return slots.flatMap((slot) => {
    if (!keys.includes(slot.key) || photos.has(slot.key)) return []
    const name = slotNameKey(slot.key)
    return fields.some((field) => field.key === name) && (copy[name] ?? '').trim() !== '' ? [slot.key] : []
  })
}
