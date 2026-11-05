// Output image tokens for GPT Image models, ported from OpenAI's own calculator on the image
// generation guide (developers.openai.com/api/docs/guides/image-generation, the
// GptImageTokenCalculator component, read 2026-11-05). The pricing floor (ARCHITECTURE §6.1)
// is set on each tier's square; output-size.ts uses this to prove no other ratio costs more.
// Reproduces the guide's published numbers: 1024² high on 2.5 = 1,756, 1536×1024 high = 1,372.

export const TOKEN_MODELS = ['gpt-image-2', 'gpt-image-2.5', 'gpt-image-2.6'] as const
export type TokenModel = (typeof TOKEN_MODELS)[number]

const GPT_IMAGE_25_BASE = { low: 16, medium: 24, high: 48, xhigh: 64, max: 96 }

// Patches along the long edge, per model and quality.
export const TOKEN_BASE: Record<TokenModel, Partial<Record<string, number>>> = {
  'gpt-image-2': { low: 16, medium: 48, high: 96 },
  'gpt-image-2.5': GPT_IMAGE_25_BASE,
  'gpt-image-2.6': GPT_IMAGE_25_BASE,
}

// 2.6 bills low and medium at a multiple of 2.5's count; high and up are the same.
const GPT_IMAGE_26_FACTOR: Partial<Record<string, number>> = { low: 4.2, medium: 3.3, high: 1, xhigh: 1, max: 1 }

// The calculator rounds a .5 patch count to the even neighbour.
function roundHalfEven(value: number): number {
  const floor = Math.floor(value)
  return value - floor === 0.5 ? floor + (floor % 2) : Math.round(value)
}

export function outputTokens(model: TokenModel, width: number, height: number, quality: string): number {
  const base = TOKEN_BASE[model][quality]
  if (base === undefined) throw new Error(`unsupported quality ${quality} for ${model}`)
  const shortPatches = roundHalfEven(base / (Math.max(width, height) / Math.min(width, height)))
  const tokens = Math.ceil((base * shortPatches * (2e6 + width * height)) / 4e6)
  return model === 'gpt-image-2.6' ? Math.round(tokens * (GPT_IMAGE_26_FACTOR[quality] ?? 1)) : tokens
}
