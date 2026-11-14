// What the user chooses about the output (DESIGN §4.3), shared by validation, the provider
// and the pricing check. The UI labels tiers 1K / 2K / 4K next to the real pixel size.

// Resolution tiers (ARCHITECTURE §8.1): 1024², 2048², and the model's largest size, labelled 4K
// (3840×2160 at 16:9, 2880² at 1:1). Default '1k'. Which tiers a template offers comes from its
// model's capabilities, never from this list.
export const RESOLUTIONS = ['1k', '2k', '4k'] as const
export type Resolution = (typeof RESOLUTIONS)[number]
export const DEFAULT_RESOLUTION: Resolution = '1k'

// Before 2026-11 the top tier was called '3k'. Jobs, test runs and admin history keep that id,
// and the database stores it until the contract migration (db-resolution.ts): read it as '4k'.
export const LEGACY_RESOLUTIONS: Readonly<Record<string, Resolution>> = { '3k': '4k' }

export function normalizeResolution<T>(value: T): T | Resolution {
  return typeof value === 'string' && Object.hasOwn(LEGACY_RESOLUTIONS, value) ? LEGACY_RESOLUTIONS[value]! : value
}

export const isResolution = (value: unknown): value is Resolution =>
  typeof value === 'string' && (RESOLUTIONS as readonly string[]).includes(value)

// The output sizes the workspace offers, default first. 'original' follows the photo's own ratio
// (the closest size the model supports); the rest are fixed width:height ratios.
export const OUTPUT_ASPECTS = ['original', '16:9', '4:5', '1:1', '9:16', '3:2', '4:3', '2:3', '1:2', '1:3'] as const
export type OutputAspect = (typeof OUTPUT_ASPECTS)[number]

// Tall poster sizes (dense-text posters): offered only by a template that lists them in
// fields.aspectRatios, never by default, so other templates keep their eight sizes.
export const TALL_ASPECTS = ['1:2', '1:3'] as const satisfies readonly OutputAspect[]
export const isTallAspect = (aspect: string): boolean => (TALL_ASPECTS as readonly string[]).includes(aspect)

// The optional "Anything to change?" note (ARCHITECTURE §4 inputs.note).
export const NOTE_MAX_LENGTH = 300
