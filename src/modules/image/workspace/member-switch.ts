import type { CatalogueCopyField, CatalogueTemplate } from '../catalogue/catalogue-template'
import type { FormValues } from './workspace-form'

// What choosing another member of a series does to the one draft the series panel keeps
// (Owner 2026-11-12): the photo, size, resolution and note stay; the previous template's text
// fields and on/off choices go (their keys belong to that template, and the server refuses
// unknown ones), except text the next member asks for under the same key and type, a choice only
// when it is still one of its options (总控 2026-11-12: a series sharing its fields keeps what was
// typed); a member that takes no photo drops the picked ones. Slot photos stay by slot key
// (useSlotPhotos shows only the slots the next member has). Null when nothing changes.
export function memberSwitch(members: readonly CatalogueTemplate[], currentId: string, nextId: string, copy: Record<string, string> = {}) {
  const current = members.find((member) => member.id === currentId)
  const next = members.find((member) => member.id === nextId)
  if (!next || next.id === currentId) return null
  const values: Partial<FormValues> = { copy: keptCopy(current, next, copy), toggles: {} }
  return { memberId: next.id, values, clearPhotos: next.photoInput === 'none' }
}

function keptCopy(current: CatalogueTemplate | undefined, next: CatalogueTemplate, copy: Record<string, string>): Record<string, string> {
  return Object.fromEntries((next.copyFields ?? []).flatMap((field) => {
    const was = current?.copyFields?.find((candidate) => candidate.key === field.key)
    const value = copy[field.key]
    // Text left as the previous member's example becomes this member's (each copies its own cover).
    if (field.example && (!value || !was || value === was.example)) return [[field.key, field.example]]
    const kept = keptValue(field, was, value)
    return kept === null ? [] : [[field.key, kept]]
  }))
}

function keptValue(field: CatalogueCopyField, was: CatalogueCopyField | undefined, value: string | undefined): string | null {
  if (!was || was.type !== field.type || !value) return null
  if (field.type === 'select' && !field.options?.some((option) => option.value === value)) return null
  return value.slice(0, field.maxLength)
}
