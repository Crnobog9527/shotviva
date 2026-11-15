import type { FamilyJudge, TemplateJudge } from '../template-apply/judge-schema'
import type { TrialInput } from '../template-apply/trial-schema'

// The checklist one trial result is judged on: the family's items (batch file `judge.bar`), the
// template's own, the input set's own, and, when asked, one item per copy field the image must
// show exactly. Plus the pixel checks that need no model: alpha and a QR code. Pure.

export type ModelItem = { id: string; text: string }
export type Alpha = 'opaque' | 'transparent' | 'any'
export type QrExpectation = { text: string } | { slot: string } | null

export type Checklist = { items: ModelItem[]; alpha: Alpha; qr: QrExpectation }

const EXPECTED_TEXT_MAX = 300

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
    for (const value of Object.values(input.fields ?? {})) {
      const text = value.trim()
      if (text) texts.push(`The image shows the text "${text.slice(0, EXPECTED_TEXT_MAX)}" exactly as written, every character correct.`)
    }
  }
  const unique = [...new Set(texts)]
  return {
    items: unique.map((text, i) => ({ id: String(i + 1), text })),
    alpha: template?.alpha ?? family?.alpha ?? defaultAlpha(modelParams),
    qr: template?.qr ?? family?.qr ?? null,
  }
}
