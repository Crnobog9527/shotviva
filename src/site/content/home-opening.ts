import type { LocalizedTemplate } from '@/core/templates'
import type { PublicBundle } from '@/core/templates/cached-bundles'

// Which template the home page's first-screen generator card opens on (Owner 2026-11-26:
// 「改成从首页精选组合里的模板随机展示」), in this order:
// 1. a hero option's own template (/x/hero/…, generatorTemplate), while it is live;
// 2. the admin's first 首页精选 template, when 首页精选 has any;
// 3. a 精选组合 member picked at random in the browser among every live member with both covers
//    (the server renders the first one, so the page stays one cached render);
// 4. otherwise the rail's first template (homePanelTemplates), never simply the catalogue's first.

type Live = Pick<LocalizedTemplate, 'id' | 'coverBeforeUrl' | 'coverAfterUrl'> & { fields: { images: { slots?: readonly unknown[] | null } } }

// Every live bundle member the card can open on, in bundle order, once each: both covers (the card
// shows the pair), and no named image slots (those open in their own workspace, never the card).
export function bundleOpeningIds(live: readonly Live[], bundles: readonly PublicBundle[]): string[] {
  const byId = new Map(live.map((template) => [template.id, template]))
  const ids = bundles.flatMap((bundle) => bundle.memberIds).filter((id) => {
    const template = byId.get(id)
    return Boolean(template?.coverBeforeUrl && template.coverAfterUrl && !template.fields.images.slots?.length)
  })
  return [...new Set(ids)]
}

// `defaultId`: what the server renders (null: the rail's first). `shuffle`: the browser swaps it
// for a random bundle member (bundleOpeningIds, read again from /api/home/opening).
export type GeneratorOpening = { defaultId: string | null; shuffle: boolean }

export function generatorOpening({ heroTemplate, featuredId, bundleIds }: { heroTemplate: string | null; featuredId: string | null; bundleIds: readonly string[] }): GeneratorOpening {
  if (heroTemplate) return { defaultId: heroTemplate, shuffle: false }
  if (featuredId) return { defaultId: featuredId, shuffle: false }
  const [first] = bundleIds
  if (first) return { defaultId: first, shuffle: bundleIds.length > 1 }
  return { defaultId: null, shuffle: false }
}
