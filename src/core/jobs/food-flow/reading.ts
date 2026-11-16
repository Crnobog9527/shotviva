import { z } from 'zod'

import { DISH_READ_CATEGORIES } from '../../templates/food-flow'
import type { ProviderPrices } from '../provider'

// The dish reading of a food template's flow (ARCHITECTURE §5.1c「餐饮开关的出图流程」): one
// vision call on the active 'decision' row turns the user's photo into a description the image
// model can cook from. The adapter lives in modules/image (like the identity judge); core only
// knows this contract.

const text = (max: number) => z.string().transform((value) => value.trim().slice(0, max))

// Limits are applied on parse, so a long answer is cut rather than refused: what the image model
// gets stays far below PROMPT_MAX_LENGTH whatever the reader writes.
export const dishReadingSchema = z.object({
  dish_name: text(120),
  // A name carries the visible features too (kind, head, skin, cut, piece count), so it gets room.
  main_ingredients: z.array(z.object({ name: text(200), color: text(80) })).transform((items) => items.slice(0, 8)),
  sauce: text(200),
  garnish: z.array(z.object({ item: text(120), shape: text(120), count: text(40) })).transform((items) => items.slice(0, 8)),
  dishware: text(300),
  category: z.enum(DISH_READ_CATEGORIES),
})
export type DishReading = z.infer<typeof dishReadingSchema>

export type DishReaderUsage = { inputTokens: number; outputTokens: number }

export type DishReader = {
  // `<ai_providers.id>/<model>`, like generation_jobs.provider.
  tag: string
  // The decision row's per-million prices, to cost the step with the job (T33).
  prices?: ProviderPrices | null
  // `imageDataUrl`: the photo as a data: URL. Throws on any failure; the flow then falls back.
  // `userDishName`: what the user typed as the dish's name (userDishName), never an instruction.
  read(input: { imageDataUrl: string; instructions: string; signal: AbortSignal; userDishName?: string }): Promise<{ reading: DishReading; usage: DishReaderUsage | null }>
}

const filled = (value: string) => value.length > 0

// The reading as the {{food_dish}} text: labelled facts, no wording of its own beyond the labels,
// so the prompt rules stay in the template's private body.
export function dishText(reading: DishReading): string {
  const ingredients = reading.main_ingredients.filter((item) => filled(item.name))
    .map((item) => (filled(item.color) ? `${item.name} (${item.color})` : item.name))
  const garnish = reading.garnish.filter((item) => filled(item.item))
    .map((item) => [item.item, item.shape, item.count].filter(filled).join(', '))
  return [
    reading.dish_name,
    ingredients.length ? `Main ingredients: ${ingredients.join('; ')}.` : '',
    filled(reading.sauce) ? `Sauce: ${reading.sauce}.` : '',
    garnish.length ? `Garnish: ${garnish.join('; ')}.` : '',
  ].filter(filled).join(' ')
}

// The template's optional copy field the user may type the dish's name into (Owner 2026-11-15).
export const DISH_NAME_FIELD = 'dish_name'
export const DISH_NAME_MAX = 60

// The typed name as the reader may see it: one line, no control characters, at most 60
// characters; '' when nothing usable is left. It stays data: the reader quotes it, never obeys it.
export function userDishName(copy: Record<string, string>): string {
  const raw = copy[DISH_NAME_FIELD] ?? ''
  return raw.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, DISH_NAME_MAX).trim()
}
