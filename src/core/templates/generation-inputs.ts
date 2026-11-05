import { AppError } from '../errors'
import { NOTE_MAX_LENGTH } from './output-options'
import type { TemplateFields } from './schema'

export type GenerationInputs = {
  // Every copy field of the template, '' when the optional field was left empty.
  copy: Record<string, string>
  aspectRatio: string
  // The optional "Anything to change?" text, trimmed; '' when none.
  note: string
}

export type RawGenerationInputs = {
  copy?: Record<string, unknown>
  aspectRatio?: string
  note?: string
  imageCount: number
  // Sizes this entry point may ask for, default first. The web offers the eight output sizes
  // (DESIGN §4.3); the partner route keeps the template's own list (its contract, §14.6).
  aspects?: readonly string[]
}

const invalid = (message: string) => new AppError('INVALID_INPUT', message)

function checkCopy(fields: TemplateFields, raw: Record<string, unknown>): Record<string, string> {
  const known = new Set(fields.copy.map((field) => field.key))
  const unknown = Object.keys(raw).find((key) => !known.has(key))
  if (unknown) throw invalid(`Unknown field: ${unknown}`)

  const copy: Record<string, string> = {}
  for (const field of fields.copy) {
    const value = raw[field.key]
    if (value !== undefined && typeof value !== 'string') throw invalid(`${field.label} must be text`)
    const text = (value ?? '').trim()
    if (field.required && text.length === 0) throw invalid(`${field.label} is required`)
    if (text.length > field.maxLength) throw invalid(`${field.label} is too long`)
    copy[field.key] = text
  }
  return copy
}

function checkAspect(fields: TemplateFields, raw: RawGenerationInputs): string {
  const aspects = raw.aspects ?? fields.aspectRatios
  const aspectRatio = raw.aspectRatio ?? aspects[0]
  if (!aspectRatio || !aspects.includes(aspectRatio)) throw invalid('Unsupported aspect ratio')
  return aspectRatio
}

function checkNote(raw: RawGenerationInputs): string {
  const note = (raw.note ?? '').trim()
  if (note.length > NOTE_MAX_LENGTH) throw invalid('Note is too long')
  return note
}

// Checks what the user filled in against the template's field definitions (ARCHITECTURE §5).
export function validateGenerationInputs(fields: TemplateFields, raw: RawGenerationInputs): GenerationInputs {
  const { min, max } = fields.images
  if (raw.imageCount < min || raw.imageCount > max) {
    throw invalid(min === max ? `This template needs ${min} photo(s)` : `This template takes ${min}–${max} photos`)
  }
  return { copy: checkCopy(fields, raw.copy ?? {}), aspectRatio: checkAspect(fields, raw), note: checkNote(raw) }
}

// `{{key}}` placeholders take the user's copy (and `{{aspect_ratio}}`); unknown ones render
// empty so a template edit can never leak a raw placeholder to the model. The user's note goes
// after the rendered template, never inside it, so it cannot reorder the template's own text
// (ARCHITECTURE §4 inputs.note).
export function renderPrompt(body: string, inputs: GenerationInputs): string {
  const values: Record<string, string> = { ...inputs.copy, aspect_ratio: inputs.aspectRatio }
  const rendered = body.replace(/\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/g, (_, key: string) => values[key] ?? '').trim()
  return inputs.note ? `${rendered}\n\n${inputs.note}` : rendered
}
