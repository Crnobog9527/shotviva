import type { ImageOptions } from '@/core/templates/image-options'
import { closestAspect } from './output-choice'
import type { Translate } from '@/core/translate'
import { normalizeResolution, type OutputAspect, type Resolution } from '@/core/templates/output-options'

import { outputSize, type OutputSize } from '../provider/output-size'

// The sizes (eight, plus the tall poster ratios a template opts into) and three resolutions as the
// workspace shows them (DESIGN §4.3). Tiers are labelled 1K / 2K / 4K next to the pixel size the
// photo will actually have; names and use lines live in site/messages (app.sizes, app.tiers);
// this file holds ids, order and geometry.

export type SizeOption = { id: OutputAspect; ratio: string | null; glyph: { w: number; h: number; dashed: boolean } }

const SIZE_ORDER: readonly OutputAspect[] = ['original', '16:9', '4:5', '1:1', '9:16', '3:2', '4:3', '2:3', '1:2', '1:3']

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

// The nearest-size tile follows each source photo. Fixed tiles stay available so a batch
// can also request a single size for all photos.
export function sizeChoices(options: ImageOptions, ratio?: number | null) {
  const nearest = !options.originalRatio ? closestAspect(ratio, options) : null
  return SIZE_OPTIONS.filter(({ id }) => id === 'original' ? options.originalRatio || nearest !== null : options.aspectRatios.includes(id))
    .map((size) => size.id === 'original' && nearest
      ? { ...size, nearest, glyph: { ...glyphFor(nearest), dashed: true } }
      : { ...size, nearest: null })
}

export type TierOption = { id: Resolution; px: number }

export const TIER_OPTIONS: readonly TierOption[] = [
  { id: '1k', px: 1024 },
  { id: '2k', px: 2048 },
  { id: '4k', px: 2880 },
]

// The long edge of a work's output when its ratio is fixed (4K at 16:9 is 3840 px, at 1:1 2880 px).
// 0 when it followed the photo's own ratio: jobs do not record the output size, and the square
// edge would understate a wide 4K photo. Messages drop the pixel part for 0.
export function tierPx(id: Resolution, aspect?: string | null): number {
  if (!aspect || aspect === 'original' || !/^\d{1,2}:\d{1,2}$/.test(aspect)) return 0
  try {
    const { width, height } = outputSize(normalizeResolution(id), aspect)
    return Math.max(width, height)
  } catch {
    return 0 // a stored ratio beyond 3:1
  }
}

// The exact output size for the picker: a fixed ratio, or 'original' with the photo's ratio.
// Null when 'original' has no photo yet (the picker then shows the square edge).
export function tierSize(id: Resolution, aspect: OutputAspect, photoRatio?: number | null): OutputSize | null {
  if (aspect !== 'original') return outputSize(id, aspect)
  return photoRatio ? outputSize(id, 'original', { width: photoRatio * 1000, height: 1000 }) : null
}

// `t` scoped to `app`: "Standard", "Banner 16:9", "Original".
// A job restored from a session saved before the 4K rename may still say '3k'.
export const tierName = (id: Resolution, t: Translate) => t(`tiers.${normalizeResolution(id)}.name`)

export function sizeLabel(id: OutputAspect, t: Translate): string {
  const name = t(`sizes.${id}`)
  return id === 'original' ? name : t('sizes.withRatio', { name, ratio: id })
}

// Example for "Anything to change?", matched to the template's category key so a handbag never
// gets a food example (B comp workspace.html). Categories are added in admin (T75), so one
// without its own example falls back. `t` scoped to app.workspace.notePlaceholder.
export const notePlaceholder = (category: string, t: Translate) => (t.has(category) ? t(category) : t('fallback'))
