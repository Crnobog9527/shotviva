import { AppError } from '../errors'
import { NOTE_MAX_LENGTH } from './output-options'
import type { TemplateFields } from './schema'
import type { ToggleField, ToggleFragments } from './toggles'

export type GenerationInputs = {
  // Every copy field of the template, '' when the optional field was left empty.
  copy: Record<string, string>
  aspectRatio: string
  // The optional "Anything to change?" text, trimmed; '' when none.
  note: string
  // Every toggle of the template (T89), false unless the user turned it on.
  toggles: Record<string, boolean>
  // Toggles that are on and whose confirm dialog the user accepted (the job records when).
  confirmed: string[]
}

export type RawGenerationInputs = {
  copy?: Record<string, unknown>
  aspectRatio?: string
  note?: string
  // Web only (T89); the partner route sends none, so every toggle stays off.
  toggles?: Record<string, unknown>
  // Keys whose confirm dialog the user accepted in the browser.
  togglesConfirmed?: readonly string[]
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

// A toggle with a confirm dialog may be on only when the request says the user accepted it
// (T89: the server never trusts the UI alone).
function toggleValue(toggle: ToggleField, given: Record<string, unknown>, accepted: ReadonlySet<string>): boolean {
  const value = given[toggle.key] ?? toggle.default
  if (typeof value !== 'boolean') throw invalid(`${toggle.label} must be on or off`)
  if (value && toggle.confirm && !accepted.has(toggle.key)) throw invalid(`${toggle.label} needs your confirmation`)
  return value
}

// Only the template's own toggles, only booleans; absent ones take their default (off). A key the
// template no longer has is ignored when it is off (a queued job or an open tab after an admin
// removed or renamed it), refused when it asks for something on.
function checkToggles(fields: TemplateFields, raw: RawGenerationInputs): Pick<GenerationInputs, 'toggles' | 'confirmed'> {
  const defined = fields.toggles ?? []
  const given = raw.toggles ?? {}
  const unknown = Object.keys(given).find((key) => given[key] !== false && !defined.some((toggle) => toggle.key === key))
  if (unknown) throw invalid(`Unknown option: ${unknown}`)
  const accepted = new Set(raw.togglesConfirmed ?? [])
  const toggles: Record<string, boolean> = {}
  const confirmed: string[] = []
  for (const toggle of defined) {
    toggles[toggle.key] = toggleValue(toggle, given, accepted)
    if (toggles[toggle.key] && toggle.confirm) confirmed.push(toggle.key)
  }
  return { toggles, confirmed }
}

// Checks what the user filled in against the template's field definitions (ARCHITECTURE §5).
export function validateGenerationInputs(fields: TemplateFields, raw: RawGenerationInputs): GenerationInputs {
  const { min, max } = fields.images
  if (raw.imageCount < min || raw.imageCount > max) {
    throw invalid(min === max ? `This template needs ${min} photo(s)` : `This template takes ${min}–${max} photos`)
  }
  return { copy: checkCopy(fields, raw.copy ?? {}), aspectRatio: checkAspect(fields, raw), note: checkNote(raw), ...checkToggles(fields, raw) }
}

// `{{key}}` placeholders take the user's copy (and `{{aspect_ratio}}`), and a toggle's key its
// private "on" or "off" fragment (T89, model_params.toggles); unknown ones render empty so a
// template edit can never leak a raw placeholder to the model. The user's note goes after the
// rendered template, never inside it, so it cannot reorder the template's own text
// (ARCHITECTURE §4 inputs.note).
export function renderPrompt(
  body: string, inputs: GenerationInputs, fragments: ToggleFragments = {},
  counts = { photo_count: 0, style_ref_count: 0 },
): string {
  const chosen = Object.entries(inputs.toggles).map(([key, on]) => [key, fragments[key]?.[on ? 'on' : 'off'].trim() ?? ''])
  const values: Record<string, string> = {
    ...Object.fromEntries(chosen), ...inputs.copy, aspect_ratio: inputs.aspectRatio,
    photo_count: String(counts.photo_count), style_ref_count: String(counts.style_ref_count),
  }
  const rendered = body.replace(/\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/g, (_, key: string) => values[key] ?? '').trim()
  return inputs.note ? `${rendered}\n\n${inputs.note}` : rendered
}
