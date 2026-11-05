import type { OutputAspect, Resolution } from '@/core/templates'

// The eight sizes and three resolutions as the workspace shows them (DESIGN §4.3). Internal
// ids (1k / 2k / 3k) never reach the screen; neither do "4K", "Ultra HD" or "SD".

export type SizeOption = { id: OutputAspect; name: string; ratio: string | null; glyph: { w: number; h: number; dashed: boolean } }

const SIZE_NAMES: Record<OutputAspect, string> = {
  original: 'Original',
  '16:9': 'Banner',
  '4:5': 'Post',
  '1:1': 'Listing',
  '9:16': 'Story',
  '3:2': 'Rental',
  '4:3': 'Website',
  '2:3': 'Pin',
}

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
  name: SIZE_NAMES[id],
  ratio: id === 'original' ? null : id,
  glyph: glyphFor(id),
}))

export type TierOption = { id: Resolution; name: string; px: number; use: string }

export const TIER_OPTIONS: readonly TierOption[] = [
  { id: '1k', name: 'Standard', px: 1024, use: 'Social & delivery apps' },
  { id: '2k', name: 'HD', px: 2048, use: 'Websites & online stores' },
  { id: '3k', name: 'Max', px: 2880, use: 'Print & zoom' },
]

export const tierName = (id: Resolution) => TIER_OPTIONS.find((tier) => tier.id === id)?.name ?? 'Standard'

export function sizeLabel(id: OutputAspect): string {
  const option = SIZE_OPTIONS.find((size) => size.id === id)
  if (!option) return 'Original'
  return option.ratio ? `${option.name} ${option.ratio}` : option.name
}
