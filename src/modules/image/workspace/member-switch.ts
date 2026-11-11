import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import type { FormValues } from './workspace-form'

// What choosing another member of a series does to the one draft the series panel keeps
// (Owner 2026-11-12): the photo, size, resolution and note stay; the previous template's text
// fields and on/off choices go (their keys belong to that template, and the server refuses
// unknown ones); a member that takes no photo drops the picked ones. Null when nothing changes.
export function memberSwitch(members: readonly CatalogueTemplate[], currentId: string, nextId: string) {
  const next = members.find((member) => member.id === nextId)
  if (!next || next.id === currentId) return null
  const values: Partial<FormValues> = { copy: {}, toggles: {} }
  return { memberId: next.id, values, clearPhotos: next.photoInput === 'none' }
}
