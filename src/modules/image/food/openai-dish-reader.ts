import 'server-only'

import { dishReadingSchema, type DishReader } from '@/core/jobs'
import { DISH_READ_CATEGORIES } from '@/core/templates'

import { postResponses, readResponsesOutput, type OpenAIResponsesConfig } from '../edit/openai-responses'

// The dish reading of a food template's flow (ARCHITECTURE §5.1c) on the 'decision' row's
// Responses API model: the photo, the template's private instructions, a strict schema, lowest
// effort, nothing stored. Same row and key as the identity judge (classifier-provider.ts).

const str = { type: 'string' } as const
const object = (properties: Record<string, unknown>) => ({
  type: 'object', properties, required: Object.keys(properties), additionalProperties: false,
})

export const DISH_READING_SCHEMA = object({
  dish_name: str,
  main_ingredients: { type: 'array', items: object({ name: str, color: str }) },
  sauce: str,
  garnish: { type: 'array', items: object({ item: str, shape: str, count: str }) },
  dishware: str,
  category: { type: 'string', enum: [...DISH_READ_CATEGORIES] },
})

export function dishReadingBody(model: string, instructions: string, imageDataUrl: string) {
  return {
    model,
    instructions,
    input: [{ role: 'user', content: [{ type: 'input_image', image_url: imageDataUrl, detail: 'high' }] }],
    reasoning: { effort: 'none' },
    store: false,
    max_output_tokens: 800,
    text: { format: { type: 'json_schema', name: 'dish_reading', strict: true, schema: DISH_READING_SCHEMA } },
  }
}

export function createOpenAIDishReader(config: OpenAIResponsesConfig, tag: string): DishReader {
  return {
    tag,
    async read({ imageDataUrl, instructions, signal }) {
      const { json, usage } = readResponsesOutput(await postResponses(config, dishReadingBody(config.model, instructions, imageDataUrl), signal))
      return { reading: dishReadingSchema.parse(json), usage }
    },
  }
}
