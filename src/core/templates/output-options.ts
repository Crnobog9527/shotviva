// What the user chooses about the output (DESIGN §4.3), shared by validation, the provider
// and the pricing check. Ids only: the UI says Standard / HD / Max, never 1K / 2K / 3K.

// Resolution tiers (ARCHITECTURE §8.1): 1024², 2048², 2880² squares. Default '1k'.
export const RESOLUTIONS = ['1k', '2k', '3k'] as const
export type Resolution = (typeof RESOLUTIONS)[number]
export const DEFAULT_RESOLUTION: Resolution = '1k'

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
