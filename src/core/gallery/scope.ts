// The gallery's scope (ARCHITECTURE §9 第 7 条): web works only, and never the freeform template
// (its text is a whole prompt) or a photo edit (its text is the edit instruction). Every read,
// the screen, the review queue and the indexes (migration 1203) use the same two exclusions.
export const GALLERY_EXCLUDED_TEMPLATES = ['freeform', 'edit'] as const

export function inGalleryScope(work: { source: string; templateId: string }): boolean {
  return work.source === 'web' && !(GALLERY_EXCLUDED_TEMPLATES as readonly string[]).includes(work.templateId)
}
