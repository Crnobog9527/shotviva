import { z } from 'zod'

import { AppError } from '../errors'

// A template's text fields (ARCHITECTURE §5 `fields.copy`): what the user types or picks for this
// template (a headline, a price, a dish, a size). Defined per template in the admin editor, so a
// new series needs no code. No `server-only`: the editor, the workspace and the import script
// share these shapes.

export const COPY_FIELD_TYPES = ['short', 'long', 'select', 'number'] as const
export type CopyFieldType = (typeof COPY_FIELD_TYPES)[number]

// Hard ceilings. maxLength stays ≤4000 for every type: rows written before the types existed
// (all 'short') may already use up to that much.
// Text fields per template (总控 2026-11-12: 12, was 10).
export const COPY_FIELDS_MAX = 12
export const COPY_MAX_LENGTH = 4000
export const COPY_OPTIONS_MAX = 20
export const COPY_OPTION_MAX_LENGTH = 60
// What the admin editor proposes for a new field of each type.
export const COPY_DEFAULT_LENGTH: Record<CopyFieldType, number> = { short: 200, long: 1000, select: COPY_OPTION_MAX_LENGTH, number: 20 }

const NUMBER = /^-?\d+(\.\d+)?$/

export const copyFieldSchema = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9_]*$/),
    label: z.string().min(1).max(60),
    // Hint inside the empty input; optional in every language (ARCHITECTURE §5).
    placeholder: z.string().max(200).optional(),
    // One line under the field (e.g. "Shown on the poster exactly as typed").
    help: z.string().trim().max(200).optional(),
    // Rows from before the types existed are all one-line text.
    type: z.enum(COPY_FIELD_TYPES).default('short'),
    required: z.boolean().default(false),
    maxLength: z.number().int().min(1).max(COPY_MAX_LENGTH).default(200),
    // select: the choices, in English (the value the prompt gets); zh labels are translations.
    options: z.array(z.string().trim().min(1).max(COPY_OPTION_MAX_LENGTH)).max(COPY_OPTIONS_MAX).optional(),
    // number: optional bounds.
    min: z.number().optional(),
    max: z.number().optional(),
    // May the public work page (§9) show what the user typed here, and one-click reuse carry it
    // to someone else? Off unless the admin turns it on: a user's words stay theirs.
    public: z.boolean().default(false),
  })
  .superRefine((field, ctx) => {
    for (const message of shapeProblems(field)) ctx.addIssue({ code: 'custom', message: `${field.key}: ${message}`, path: [field.key] })
  })

type FieldShape = { type: CopyFieldType; options?: string[]; min?: number; max?: number }

// A user's choice goes through cleanCopy before it is matched, so an option it would change
// ("Extra  large", a zero-width space) could never be chosen: refuse it (the admin editor cleans
// options before saving, so only a hand-written import can trip this).
function optionProblems(field: FieldShape): string[] {
  const options = field.options ?? []
  if (field.type !== 'select') return options.length ? ['only a choice field has options'] : []
  if (options.length < 2) return ['a choice field needs at least 2 options']
  if (options.some((option) => cleanCopy('select', option) !== option)) return ['options may not hold line breaks, repeated spaces or invisible characters']
  return new Set(options).size === options.length ? [] : ['options must be different']
}

function boundProblems(field: FieldShape): string[] {
  const bounded = field.min !== undefined || field.max !== undefined
  if (field.type !== 'number') return bounded ? ['only a number field has min / max'] : []
  return field.min !== undefined && field.max !== undefined && field.min > field.max ? ['min must not exceed max'] : []
}

const shapeProblems = (field: FieldShape) => [...optionProblems(field), ...boundProblems(field)]

export type CopyField = z.infer<typeof copyFieldSchema>

const invalid = (message: string) => new AppError('INVALID_INPUT', message)

// Control characters never reach the model: a line break survives only in long text (tabs
// become spaces there); every other type is one line with runs of whitespace collapsed.
const CONTROL = new RegExp('[\\u0000-\\u0008\\u000b-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u2028-\\u202e\\u2060-\\u206f\\ufeff]', 'g')

export function cleanCopy(type: CopyFieldType, value: string): string {
  const text = value.replace(/\r\n?/g, '\n').replace(/\t/g, ' ').replace(CONTROL, '')
  if (type !== 'long') return text.replace(/\s+/g, ' ').trim()
  return text.split('\n').map((line) => line.replace(/ {2,}/g, ' ').trimEnd()).join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

const outOfRange = (field: CopyField, number: number) =>
  (field.min !== undefined && number < field.min) || (field.max !== undefined && number > field.max)

// The type's own rule for a non-empty value: a listed option, or a number within bounds.
function checkTyped(field: CopyField, text: string) {
  if (field.type === 'select' && !(field.options ?? []).includes(text)) throw invalid(`${field.label}: choose one of the options`)
  if (field.type !== 'number') return
  if (!NUMBER.test(text)) throw invalid(`${field.label} must be a number`)
  if (outOfRange(field, Number(text))) throw invalid(`${field.label} is out of range`)
}

// One field's value as the server accepts it: cleaned, then required / length / type checked.
// '' for an optional field left empty.
export function checkCopyValue(field: CopyField, value: unknown): string {
  if (value !== undefined && typeof value !== 'string') throw invalid(`${field.label} must be text`)
  const text = cleanCopy(field.type, value ?? '')
  if (text.length === 0) {
    if (field.required) throw invalid(`${field.label} is required`)
    return ''
  }
  if (text.length > field.maxLength) throw invalid(`${field.label} is too long`)
  checkTyped(field, text)
  return text
}

const placeholderIn = (body: string, key: string) => new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`).test(body)

// The fields the prompt body has no `{{key}}` for, as "Label: value" lines (English label; the
// value as the user wrote it), in the template's field order; empty values are left out. The
// value is inserted as is and never scanned for placeholders again.
export function copyLines(body: string, copy: Record<string, string>, labels: Record<string, string>): string {
  return Object.entries(copy)
    .filter(([key, value]) => value && labels[key] && !placeholderIn(body, key))
    .map(([key, value]) => `${labels[key]}: ${value}`)
    .join('\n')
}

// The fields marked public when a job was made (generation_jobs.inputs.copy_public): the public
// work page and one-click reuse use this snapshot, so turning a field public later never shows
// text a user typed while it was private (ARCHITECTURE §5.1d, §9 第 3 条).
export const publicCopyKeys = (fields: readonly { key: string; public?: boolean }[]): string[] =>
  fields.filter((field) => field.public).map((field) => field.key)

// The snapshot as stored; anything malformed (or a job from before the snapshot) is none.
export function storedPublicKeys(raw: unknown): ReadonlySet<string> {
  return new Set(Array.isArray(raw) ? raw.filter((key): key is string => typeof key === 'string') : [])
}
