import type { Translate } from '@/core/translate'
import type { OutputAspect, Resolution } from '@/core/templates/output-options'

// The eight sizes and three resolutions as the workspace shows them (DESIGN §4.3). Internal
// ids (1k / 2k / 3k) never reach the screen; neither do "4K", "Ultra HD" or "SD". Names and use
// lines live in site/messages (app.sizes, app.tiers); this file holds ids, order and geometry.

export type SizeOption = { id: OutputAspect; ratio: string | null; glyph: { w: number; h: number; dashed: boolean } }

const SIZE_ORDER: readonly OutputAspect[] = ['original', '16:9', '4:5', '1:1', '9:16', '3:2', '4:3', '2:3']

// Ratio glyph inside a 34×30 box; Original is a dashed 22×28 frame ("as shot").
function glyphFor(id: OutputAspect): SizeOption['glyph'] {
  if (id === 'original') return { w: 22, h: 28, dashed: true }
  const [w, h] = id.split(':').map(Number) as [number, number]
  const scale = Math.min(34 / w, 30 / h)
  return { w: Math.round(w * scale), h: Math.round(h * scale), dashed: false }
}

export const SIZE_OPTIONS: readonly SizeOption[] = SIZE_ORDER.map((id) => ({
  id,
  ratio: id === 'original' ? null : id,
  glyph: glyphFor(id),
}))

export type TierOption = { id: Resolution; px: number }

export const TIER_OPTIONS: readonly TierOption[] = [
  { id: '1k', px: 1024 },
  { id: '2k', px: 2048 },
  { id: '3k', px: 2880 },
]

export const tierPx = (id: Resolution) => TIER_OPTIONS.find((tier) => tier.id === id)?.px ?? 1024

// `t` scoped to `app`: "Standard", "Banner 16:9", "Original".
export const tierName = (id: Resolution, t: Translate) => t(`tiers.${id}.name`)

export function sizeLabel(id: OutputAspect, t: Translate): string {
  const name = t(`sizes.${id}`)
  return id === 'original' ? name : `${name} ${id}`
}

// Example for "Anything to change?", matched to the template's category so a handbag never gets
// a food example (B comp workspace.html). Categories are admin text, so unknown ones fall back.
// `t` scoped to app.workspace.notePlaceholder.
export const notePlaceholder = (category: string, t: Translate) => (t.has(category) ? t(category) : t('fallback'))
