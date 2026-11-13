import type { PosterBlock, PosterFields } from '@/core/poster'

// How the editor groups the blocks (Owner 2026-11-14: 「一共分第一页和第二页，不要拆开」): what
// both pages share (header and footer, typed once) and then each page of the set with the blocks
// only it carries, in the template's kind order, so the user fills the whole set in one place.
export type PageGroup = { key: string; page: number | null; kind: string | null; blocks: PosterBlock[] }

const SHARED: PosterBlock[] = ['header', 'footer']

export function pageGroups(poster: PosterFields): PageGroup[] {
  const used = new Set(poster.kinds.flatMap((kind) => kind.blocks))
  const shared = SHARED.filter((block) => used.has(block))
  const claimed = new Set<PosterBlock>(shared)
  const pages = poster.kinds.map((kind, i): PageGroup => {
    const own = kind.blocks.filter((block) => !claimed.has(block))
    own.forEach((block) => claimed.add(block))
    return { key: kind.key, page: i + 1, kind: kind.key, blocks: own }
  }).filter((group) => group.blocks.length > 0)
  return [...(shared.length ? [{ key: 'shared', page: null, kind: null, blocks: shared }] : []), ...pages]
}
