import type { ProviderPrices } from './provider'

// Official per-1M-token USD prices by model name (ARCHITECTURE §10.0: the Owner does not type
// prices in). A provider row's own prices win field by field; an empty field falls back to this
// table; only a price in neither place leaves the job "无法计算". Pure data, safe in the browser
// (the admin form pre-fills from it).
//
// Standard tier, read from the source page on `asOf`. A model whose official price could not be
// confirmed is left out, never guessed: its rows need hand-entered prices. Update an entry (and
// its asOf) when OpenAI changes a price; /admin/costs hints when billed and recorded drift apart.

export type ModelPrice = { prices: ProviderPrices; asOf: string; source: string }

const OPENAI_PRICING = 'https://developers.openai.com/api/docs/pricing'
const AS_OF = '2026-11-06'

// GPT Image 2.x bills its output as image tokens; there is no separate text-output price.
const GPT_IMAGE_2X: ModelPrice = { prices: { inputTextPerM: 5, inputImagePerM: 8, outputPerM: 30 }, asOf: AS_OF, source: OPENAI_PRICING }

export const MODEL_PRICES: Readonly<Record<string, ModelPrice>> = {
  'gpt-image-2.6-sunburst': GPT_IMAGE_2X,
  'gpt-image-2.6-flare': GPT_IMAGE_2X,
  'gpt-image-2.5-sunburst': GPT_IMAGE_2X,
  'gpt-image-2.5-flare': GPT_IMAGE_2X,
  // The edit classifier (T30). Input and output only: its preview image is billed as input
  // tokens. Short-context rate (≤272K input tokens); a 3 s classification never gets near that.
  'gpt-6-luna': { prices: { inputTextPerM: 0.1, inputImagePerM: null, outputPerM: 0.5 }, asOf: AS_OF, source: OPENAI_PRICING },
}

// Exact model name, ignoring surrounding spaces and case. Own-property lookup only, so a model
// named "constructor" is not a price.
export function officialPrice(model: string): ModelPrice | null {
  const key = model.trim().toLowerCase()
  return Object.hasOwn(MODEL_PRICES, key) ? MODEL_PRICES[key]! : null
}

const FIELDS = ['inputTextPerM', 'inputImagePerM', 'outputPerM'] as const

// The prices a job is costed with: the row's own, each empty one filled from the table. null when
// neither has anything, so jobCostUsd records usage but no cost.
export function effectivePrices(model: string, own: ProviderPrices | null | undefined): ProviderPrices | null {
  const official = officialPrice(model)?.prices
  if (!own && !official) return null
  const merged = Object.fromEntries(FIELDS.map((field) => [field, own?.[field] ?? official?.[field] ?? null])) as ProviderPrices
  return FIELDS.some((field) => merged[field] !== null) ? merged : null
}
