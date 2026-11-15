import sharp from 'sharp'
import { z } from 'zod'

import type { ProviderPrices } from '../../src/core/jobs'
import { postResponses, readResponsesOutput, type OpenAIResponsesConfig } from '../../src/modules/image/edit/openai-responses'
import type { ModelItem } from './checklist'

// One look by the judge line (the admin's 'decision' provider row, Responses API): the result and
// the images it was made from, labelled, and the checklist from the batch file. Strict JSON back:
// one yes/no and a short reason per item. The skeleton below is generic; what a template must get
// right is only ever in the local batch file. Nothing is stored at the provider.

export type ImageRole = 'result' | 'input' | 'cover' | 'reference'
export type JudgeImage = { role: ImageRole; label: string; bytes: Uint8Array }
export const EFFORTS = ['low', 'medium', 'high'] as const
export type Effort = (typeof EFFORTS)[number]
// How long the model may think before it answers; part of a verdict's hash.
export const DEFAULT_EFFORT: Effort = 'medium'
export type JudgeLine = { tag: string; config: OpenAIResponsesConfig; prices: ProviderPrices | null; effort?: Effort }
export type ItemAnswer = { id: string; pass: boolean; reason: string }
export type JudgeAnswer = { answers: ItemAnswer[]; usage: { inputTokens: number; outputTokens: number } | null; costUsd: number | null }

// Bumped whenever the wording below changes, so earlier verdicts are not reused for it.
export const SKELETON_VERSION = 1

// What each image is: the result first, then what it was made from.
const ROLE_TEXT: Record<ImageRole, string> = {
  result: 'RESULT: the generated image you are judging.',
  input: 'USER INPUT: an image the user uploaded; the result is built from it.',
  cover: 'TEMPLATE COVER: the template\'s example result. Its scene, light and composition are what the result should follow; its own subject (dish, product, person, logo) is only a placeholder that the user\'s replaces.',
  reference: 'STYLE REFERENCE: an image the template sends to the model for style; its subject is not the user\'s.',
}

const INSTRUCTIONS = [
  'You check AI-generated images made from a template for quality control.',
  'You get labelled images and a numbered checklist. Each item is a statement about the RESULT that should be true.',
  'For each item answer pass=true only if the statement is clearly true in the RESULT as you see it; if it is false, partly true or you cannot tell, answer pass=false.',
  'Compare against the other images only as the item asks. Judge what is visible, not what was probably intended.',
  'The reason is one short sentence (at most 25 words) naming what you actually saw. Answer every item once, using its id.',
].join(' ')

export const MAX_OUTPUT_TOKENS = 3000
export const IMAGE_EDGE = 1024
// For the budget hold only: what one image and the text are assumed to cost at most, in tokens.
const IMAGE_TOKENS = 1600
const TEXT_TOKENS = 1500

const SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, pass: { type: 'boolean' }, reason: { type: 'string' } },
        required: ['id', 'pass', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
} as const

const answerSchema = z.object({ items: z.array(z.object({ id: z.string(), pass: z.boolean(), reason: z.string().trim().max(400) })) })

// A JPEG data URL no longer than IMAGE_EDGE: enough to see the dish and any text, few tokens.
// See-through areas go on white; whether the result is see-through is checked on its own pixels.
export async function dataUrl(bytes: Uint8Array): Promise<string> {
  const jpeg = await sharp(bytes, { limitInputPixels: 120_000_000 }).rotate().flatten({ background: '#ffffff' })
    .resize({ width: IMAGE_EDGE, height: IMAGE_EDGE, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer()
  return `data:image/jpeg;base64,${jpeg.toString('base64')}`
}

export async function requestBody(model: string, images: JudgeImage[], items: ModelItem[], effort: Effort = DEFAULT_EFFORT) {
  const content: unknown[] = []
  for (const [i, image] of images.entries()) {
    content.push({ type: 'input_text', text: `Image ${i + 1}: ${ROLE_TEXT[image.role]}${image.label ? ` (${image.label})` : ''}` })
    content.push({ type: 'input_image', image_url: await dataUrl(image.bytes), detail: 'high' })
  }
  content.push({ type: 'input_text', text: `Checklist:\n${items.map(item => `${item.id}. ${item.text}`).join('\n')}` })
  return {
    model,
    instructions: INSTRUCTIONS,
    input: [{ role: 'user', content }],
    reasoning: { effort },
    store: false,
    max_output_tokens: MAX_OUTPUT_TOKENS,
    text: { format: { type: 'json_schema', name: 'template_judge', strict: true, schema: SCHEMA } },
  }
}

// Image tokens are billed as input tokens on the Responses API: input × the input price.
export function judgeCostUsd(usage: { inputTokens: number; outputTokens: number } | null, prices: ProviderPrices | null): number | null {
  const input = prices?.inputTextPerM
  const output = prices?.outputPerM
  if (!usage || input == null || output == null) return null
  return Math.round(((usage.inputTokens * input + usage.outputTokens * output) / 1e6) * 1e6) / 1e6
}

// The most one look may cost, held against --budget before the call. Null when the line has no
// price: then nothing can be held and the run refuses to start.
export function judgeEstimateUsd(imageCount: number, prices: ProviderPrices | null): number | null {
  const input = prices?.inputTextPerM
  const output = prices?.outputPerM
  if (input == null || output == null) return null
  return ((imageCount * IMAGE_TOKENS + TEXT_TOKENS) * input + MAX_OUTPUT_TOKENS * output) / 1e6
}

export class JudgeAnswerError extends Error {}

// Every item answered exactly once, by its id; anything else is not a verdict.
export function readAnswer(json: unknown, items: ModelItem[]): ItemAnswer[] {
  const parsed = answerSchema.safeParse(json)
  if (!parsed.success) throw new JudgeAnswerError('JUDGE_BAD_ANSWER')
  const byId = new Map(parsed.data.items.map(item => [item.id.replace(/\.$/, '').trim(), item]))
  return items.map(item => {
    const answer = byId.get(item.id)
    if (!answer) throw new JudgeAnswerError('JUDGE_MISSING_ITEM')
    return { id: item.id, pass: answer.pass, reason: answer.reason }
  })
}

export async function askJudge(line: JudgeLine, images: JudgeImage[], items: ModelItem[], signal: AbortSignal): Promise<JudgeAnswer> {
  const body = await requestBody(line.config.model, images, items, line.effort)
  const { json, usage } = readResponsesOutput(await postResponses(line.config, body, signal))
  return { answers: readAnswer(json, items), usage, costUsd: judgeCostUsd(usage, line.prices) }
}
