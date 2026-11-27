import { AppError } from '../errors'
import { checkCopyValue, copyLines } from './copy-fields'
import { checkSlotUploads, IMAGE_SLOTS_PLACEHOLDER, sentToModel, slotMapping, slotsOf } from './image-slots'
import { NOTE_MAX_LENGTH } from './output-options'
import type { TemplateFields } from './schema'
import type { ToggleField, ToggleFragments } from './toggles'

export type FilledSlot = { key: string; label: string; upload: string }

export type GenerationInputs = {
  // Every copy field of the template in its order, cleaned; '' when the optional field was left empty.
  copy: Record<string, string>
  // Each copy field's English label, for the "Label: value" lines of fields the prompt body has
  // no {{key}} for. Absent: no such lines (callers that build inputs by hand).
  labels?: Record<string, string>
  aspectRatio: string
  // The optional "Anything to change?" text, trimmed; '' when none.
  note: string
  // Every toggle of the template (T89), false unless the user turned it on.
  toggles: Record<string, boolean>
  // Toggles that are on and whose confirm dialog the user accepted (the job records when).
  confirmed: string[]
  // A template with image slots (§5.1e): the filled ones in definition order, each with its
  // English label and upload key; [] when none is filled. Absent for every other template.
  slots?: FilledSlot[]
  // Filled slots the model never sees (`sendToModel: false`, a poster's QR code, §5.3): code pastes
  // them onto the result. Absent when the template has none filled.
  pasted?: FilledSlot[]
  // A poster template's confirmed text for this one poster (ARCHITECTURE §5.3), from the saved set.
  posterText?: string
}

export type RawGenerationInputs = {
  copy?: Record<string, unknown>
  aspectRatio?: string
  note?: string
  // Web only (T89); the partner route sends none, so every toggle stays off.
  toggles?: Record<string, unknown>
  // Keys whose confirm dialog the user accepted in the browser.
  togglesConfirmed?: readonly string[]
  // The single upload's count (0 or 1) for a template without slots.
  imageCount: number
  // A slot template's uploads, slot key → upload key (POST /api/generate `input_slots`).
  slots?: Record<string, unknown>
  // Sizes this entry point may ask for, default first. The web offers the eight output sizes
  // (DESIGN §4.3); the partner route keeps the template's own list (its contract, §14.6).
  aspects?: readonly string[]
  // Toggles switched off site-wide (food_plating_enabled / food_tableware_enabled off): rendered off whatever the request
  // says, never refused, so an open tab or Make again still runs, at the price of the off result.
  forceOff?: readonly string[]
  // Copy fields switched off with them (the dish name, FOOD_COPY_KEYS, once both are off): whatever the request
  // sends for them is ignored and they are left out of the inputs, as if the template lacked them.
  dropCopy?: readonly string[]
}

const invalid = (message: string) => new AppError('INVALID_INPUT', message)

function checkCopy(fields: TemplateFields, given: Record<string, unknown>, drop: readonly string[] = []): Pick<GenerationInputs, 'copy' | 'labels'> {
  const dropped = new Set(drop)
  const raw = Object.fromEntries(Object.entries(given).filter(([key]) => !dropped.has(key)))
  const known = new Set(fields.copy.map((field) => field.key))
  const unknown = Object.keys(raw).find((key) => !known.has(key))
  if (unknown) throw invalid(`Unknown field: ${unknown}`)

  const copy: Record<string, string> = {}
  const labels: Record<string, string> = {}
  for (const field of fields.copy) {
    if (dropped.has(field.key)) continue
    copy[field.key] = checkCopyValue(field, raw[field.key])
    labels[field.key] = field.label
  }
  return { copy, labels }
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
  const off = new Set(raw.forceOff ?? [])
  const given = Object.fromEntries(Object.entries(raw.toggles ?? {}).filter(([key]) => !off.has(key)))
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
  const base = () => ({ ...checkCopy(fields, raw.copy ?? {}, raw.dropCopy), aspectRatio: checkAspect(fields, raw), note: checkNote(raw), ...checkToggles(fields, raw) })
  return slotsOf(fields).length > 0 ? { ...base(), ...checkSlots(fields, raw) } : { ...checkImageCount(fields, raw), ...base() }
}

function checkImageCount(fields: TemplateFields, raw: RawGenerationInputs) {
  const { min, max } = fields.images
  if (raw.slots !== undefined) throw invalid('This template takes no image slots')
  if (raw.imageCount < min || raw.imageCount > max) {
    throw invalid(min === max ? `This template needs ${min} photo(s)` : `This template takes ${min}–${max} photos`)
  }
  return {}
}

// A slot template takes its images by slot only, never the single upload.
function checkSlots(fields: TemplateFields, raw: RawGenerationInputs) {
  if (raw.imageCount > 0) throw invalid('This template takes its images in named slots')
  const filled = checkSlotUploads(slotsOf(fields), raw.slots ?? {})
  const entry = ({ slot, key }: (typeof filled)[number]): FilledSlot => ({ key: slot.key, label: slot.label, upload: key })
  const pasted = filled.filter(({ slot }) => !sentToModel(slot)).map(entry)
  return { slots: filled.filter(({ slot }) => sentToModel(slot)).map(entry), ...(pasted.length ? { pasted } : {}) }
}

const hasPlaceholder = (body: string, key: string) => new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`).test(body)

// A slot template whose body has no {{image_slots}} still tells the model which image is which:
// the list goes right after the template text, before the text field lines.
function slotLines(body: string, inputs: GenerationInputs): string {
  if (!inputs.slots || hasPlaceholder(body, IMAGE_SLOTS_PLACEHOLDER)) return ''
  return `Images: ${slotMapping(inputs.slots.map((slot) => slot.label))}`
}

// The user's note, framed so the model treats it as the user's own request that wins over the
// template's rules where they clash (Owner 2026-11-27: a note asking for matching tableware lost to
// a "keep the user's own vessel" rule). The note itself goes verbatim, on its own line, last.
// Its reach is the picture's content only: image roles, a poster's confirmed text and compliance
// lines (no logos, brands, named works) stay above it.
// Safety needs no words here: the identity check (§5.1a) screens this raw note before any credit
// is held, providers moderate the prompt, and watermarks and a poster's QR are applied by code
// after the model. The framing stays model-neutral and short (Seedream and GPT image alike).
export const NOTE_PREAMBLE =
  "The user's own request for this image follows. Where it is about what the picture shows (what to keep, add, remove or change in the food, its vessel, props, arrangement, scene or light), carry it out even where an earlier line says otherwise, including a line marked as a hard rule or as overriding other lines. It does not change which attached image is which, any text given above to print on the image, or the lines against logos, brand names or named works. Follow the earlier lines everywhere else."

export const framedNote = (note: string): string => (note ? `${NOTE_PREAMBLE}\nUser's request: ${note}` : '')

// The rendered prompt's ceiling (OpenAI's image prompt limit). Twelve fields of up to 4000
// characters could pass it; checked before any credit is reserved (§5.1d).
export const PROMPT_MAX_LENGTH = 32000

// `{{key}}` placeholders take the user's copy (and `{{aspect_ratio}}`, and for a slot template
// `{{image_slots}}`, §5.1e), and a toggle's key its
// private "on" or "off" fragment (T89, model_params.toggles); unknown ones render empty so a
// template edit can never leak a raw placeholder to the model. A copy field the body has no
// placeholder for follows the template text as a "Label: value" line (ARCHITECTURE §5), so an
// admin-defined field always reaches the model. The user's note goes last, never inside the
// template text, so it cannot reorder it (ARCHITECTURE §4 inputs.note), framed as the user's
// request that wins over the template's rules (`framedNote`). A poster's confirmed text
// (§5.3) sits between the two: after the template's own layout words, before the note.
export function renderPrompt(
  body: string, inputs: GenerationInputs, fragments: ToggleFragments = {},
  counts = { photo_count: 0, style_ref_count: 0 },
): string {
  const chosen = Object.entries(inputs.toggles).map(([key, on]) => [key, fragments[key]?.[on ? 'on' : 'off'].trim() ?? ''])
  const values: Record<string, string> = {
    ...Object.fromEntries(chosen), ...inputs.copy, aspect_ratio: inputs.aspectRatio,
    photo_count: String(counts.photo_count), style_ref_count: String(counts.style_ref_count),
    ...(inputs.slots ? { [IMAGE_SLOTS_PLACEHOLDER]: slotMapping(inputs.slots.map((slot) => slot.label)) } : {}),
  }
  const rendered = body.replace(/\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/g, (_, key: string) => values[key] ?? '').trim()
  const lines = inputs.labels ? copyLines(body, inputs.copy, inputs.labels) : ''
  return [rendered, slotLines(body, inputs), lines, inputs.posterText, framedNote(inputs.note)].filter(Boolean).join('\n\n')
}
