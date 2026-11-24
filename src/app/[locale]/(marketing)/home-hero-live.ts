import 'server-only'

import type { HeroBlock, HeroScene, ImageRef } from '@/core/content'
import { coverPreview } from '@/core/templates/cover-ratio'
import type { LiveHeroScene } from '@/site/experiments'

type Covers = { id: string; coverBeforeUrl: string | null; coverAfterUrl: string | null }
type LiveHero = Pick<HeroBlock, 'before' | 'after' | 'caption' | 'scenes'>

// The plate is 4:5 and the pictures are cropped to it (object-fit: cover, marketing.css), so the
// stated size only names a 4:5 shape for the srcset; the covers keep their own.
const plate = (src: string, alt: string): ImageRef => ({ src, alt, width: 880, height: 1100 })

// The hero pairs from the templates' current covers (Owner 2026-11-25), in the listed order. A
// template that is not live (unpublished, deleted, off the web) or lacks either cover drops out;
// with none left the page keeps its own hero (null). The first pair is the first paint: its phone
// photo carries a first frame made from the live cover (cover-ratio.ts, cached per cover URL,
// which changes with every new upload), so it still paints with the page like the static one did.
export async function liveHero(scenes: readonly LiveHeroScene[], label: string, live: readonly Covers[]): Promise<LiveHero | null> {
  const byId = new Map(live.map((template) => [template.id, template]))
  const pairs: HeroScene[] = scenes.flatMap((scene) => {
    const template = byId.get(scene.templateId)
    if (!template?.coverBeforeUrl || !template.coverAfterUrl) return []
    return [{ image: plate(template.coverAfterUrl, scene.ai), before: plate(template.coverBeforeUrl, scene.phone), caption: scene.caption }]
  })
  const [first, second, ...rest] = pairs
  if (!first?.before) return null
  const { firstFrame } = await coverPreview(first.before.src, true)
  const before = firstFrame ? { ...first.before, firstFrame } : first.before
  return {
    before,
    after: first.image,
    caption: first.caption,
    scenes: second ? { label, items: [first, second, ...rest] } : undefined,
  }
}
