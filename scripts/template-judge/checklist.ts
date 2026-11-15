import type { FamilyJudge, TemplateJudge } from '../template-apply/judge-schema'
import type { TrialInput } from '../template-apply/trial-schema'

// The checklist one trial result is judged on: the family's items (batch file `judge.bar`), the
// template's own, the input set's own, and, when asked, one item per copy field the image must
// show exactly. Plus the pixel checks that need no model: alpha and a QR code. Pure.

export type ModelItem = { id: string; text: string }
export type Alpha = 'opaque' | 'transparent' | 'any'
export type QrExpectation = { text: string } | { slot: string } | null

export type Checklist = { items: ModelItem[]; alpha: Alpha; qr: QrExpectation }

// A long copy field is asked about in consecutive parts of at most this many characters, so every
// character is checked and no item grows past what one yes/no can judge.
export const EXPECTED_TEXT_PART = 300

export function textItems(value: string): string[] {
  const text = value.trim()
  if (!text) return []
  const chars = [...text]
  if (chars.length <= EXPECTED_TEXT_PART) return [`The image shows the text "${text}" exactly as written, every character correct.`]
  const parts: string[] = []
  for (let at = 0; at < chars.length; at += EXPECTED_TEXT_PART) parts.push(chars.slice(at, at + EXPECTED_TEXT_PART).join(''))
  return parts.map((part, i) => `The image shows this text exactly as written, every character correct (part ${i + 1} of ${parts.length} of one longer text, shown in order): "${part}"`)
}

// What the template asked the model for decides the default (job-background.ts keepsAlpha): a
// cut-out keeps its alpha, every other result is stored opaque.
export function defaultAlpha(modelParams: Record<string, unknown> | undefined): Alpha {
  return modelParams?.background === 'transparent' ? 'transparent' : 'opaque'
}

export function checklistFor(family: FamilyJudge | undefined, template: TemplateJudge | undefined, input: TrialInput,
  modelParams: Record<string, unknown> | undefined): Checklist {
  const texts = [...(family?.bar ?? []), ...(template?.bar ?? []), ...(input.judge ?? [])]
  const expectText = template?.expectText ?? family?.expectText ?? false
  if (expectText) {
    for (const value of Object.values(input.fields ?? {})) texts.push(...textItems(value))
  }
  const unique = [...new Set(texts)]
  return {
    items: unique.map((text, i) => ({ id: String(i + 1), text })),
    alpha: template?.alpha ?? family?.alpha ?? defaultAlpha(modelParams),
    qr: template?.qr ?? family?.qr ?? null,
  }
}
