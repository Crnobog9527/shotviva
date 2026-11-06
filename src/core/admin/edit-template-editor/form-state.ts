import { RESOLUTIONS, type Resolution } from '@/core/templates/output-options'
import { DECIDED_SCOPES, EDIT_SCOPES, type DecidedScope, type EditScope } from '@/core/templates/edit-params'

import type { EditTemplateSettings, SaveEditTemplateInput } from '../edit-template/schema'

export type EditTemplateForm = {
  isActive: boolean
  credits: Record<Resolution, string>
  wrapper: string
  inputFidelity: '' | 'high' | 'low'
  questions: Record<DecidedScope, string>
  constraints: Record<EditScope, string>
}

const text = (value: unknown) => (typeof value === 'string' ? value : '')
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}

// Whatever is stored, with blanks where a text is missing, so the page always opens.
export function formFor(settings: EditTemplateSettings): EditTemplateForm {
  const questions = record(settings.params.questions)
  const constraints = record(settings.params.constraints)
  const fidelity = settings.params.input_fidelity
  return {
    isActive: settings.isActive,
    credits: Object.fromEntries(RESOLUTIONS.map((r) => [r, String(settings.creditsCost[r])])) as Record<Resolution, string>,
    wrapper: settings.wrapper,
    inputFidelity: fidelity === 'high' || fidelity === 'low' ? fidelity : '',
    questions: Object.fromEntries(DECIDED_SCOPES.map((s) => [s, text(questions[s])])) as Record<DecidedScope, string>,
    constraints: Object.fromEntries(EDIT_SCOPES.map((s) => [s, text(constraints[s])])) as Record<EditScope, string>,
  }
}

export function toSaveInput(form: EditTemplateForm): SaveEditTemplateInput {
  return {
    isActive: form.isActive,
    creditsCost: Object.fromEntries(RESOLUTIONS.map((r) => [r, Number(form.credits[r])])) as Record<Resolution, number>,
    wrapper: form.wrapper,
    params: {
      ...(form.inputFidelity ? { input_fidelity: form.inputFidelity } : {}),
      questions: form.questions,
      constraints: form.constraints,
    },
  }
}

// Every question must have text before the page can save; the server checks again.
export function missingQuestions(form: EditTemplateForm): DecidedScope[] {
  return DECIDED_SCOPES.filter((scope) => form.questions[scope].trim() === '')
}
