import type { ImageRef, SpaceCase, SpaceCases } from '@/core/content'
import type { LocalizedTemplate } from '@/core/templates'

// The hotels block from its templates' own covers (Owner 2026-11-25), like the hero and the
// 「更多真实案例」 row: a case bound to a template that is live with both covers shows its
// cover_before_url (the phone photo) and cover_after_url (the result). The covers are 16:9
// (1600 × 900); the stated size only names that shape for the srcset. A case whose template is
// unpublished or has lost a cover keeps the block's own files, so the block never empties.

type Live = Pick<LocalizedTemplate, 'id' | 'coverBeforeUrl' | 'coverAfterUrl'>

const cover = (src: string, alt: string): ImageRef => ({ src, alt, width: 1600, height: 900 })

function liveCase(item: SpaceCase, byId: ReadonlyMap<string, Live>): SpaceCase {
  const template = item.template ? byId.get(item.template) : undefined
  if (!template?.coverBeforeUrl || !template.coverAfterUrl) return item
  return { ...item, before: cover(template.coverBeforeUrl, item.before.alt), after: cover(template.coverAfterUrl, item.after.alt) }
}

export function liveSpaces(spaces: SpaceCases | undefined, live: readonly Live[]): SpaceCases | undefined {
  if (!spaces) return undefined
  const byId = new Map(live.map((template) => [template.id, template]))
  const [first, second, ...rest] = spaces.items
  return { ...spaces, items: [liveCase(first, byId), liveCase(second, byId), ...rest.map((item) => liveCase(item, byId))] }
}
