import { z } from 'zod'

// Optional on/off choices a template offers (ARCHITECTURE §5 `fields.toggles`, T89), the first
// one "Upgrade plating & tableware". What each state says to the model lives in the private
// template_prompts.model_params.toggles.<key>.on / .off, never in the public row. No
// `server-only`: the admin editor and the workspace share these shapes.

export const TOGGLES_MAX = 3

export const FIELD_KEY = /^[a-z][a-z0-9_]*$/

// Placeholders renderPrompt fills itself; a toggle or copy field may not take these names.
export const RESERVED_KEYS = ['aspect_ratio', 'photo_count', 'style_ref_count', 'image_slots'] as const

// The dialog shown before a toggle can be turned on. The text is the template's own data (per
// template, per language), never hard-coded per category.
export const toggleConfirmSchema = z.object({
  title: z.string().trim().min(1).max(80),
  body: z.string().trim().min(1).max(1200),
  checkbox: z.string().trim().min(1).max(120),
  accept: z.string().trim().min(1).max(40),
})
export type ToggleConfirm = z.infer<typeof toggleConfirmSchema>

export const toggleFieldSchema = z.object({
  key: z.string().regex(FIELD_KEY),
  label: z.string().trim().min(1).max(60),
  hint: z.string().trim().max(200).optional(),
  // Always off until the user turns it on: the template's ordinary result is the "off" one.
  default: z.literal(false).default(false),
  confirm: toggleConfirmSchema.optional(),
})
export type ToggleField = z.infer<typeof toggleFieldSchema>

export type ToggleFragments = Record<string, { on: string; off: string }>

const fragmentSchema = z.object({ on: z.string(), off: z.string() })

// model_params.toggles as stored; anything malformed reads as no fragments (renders empty), and
// the admin save refuses it before it can be stored (toggleSetupProblems).
export function toggleFragments(modelParams: Record<string, unknown>): ToggleFragments {
  const raw = modelParams.toggles
  if (typeof raw !== 'object' || raw === null) return {}
  return Object.fromEntries(
    Object.entries(raw).flatMap(([key, value]) => {
      const parsed = fragmentSchema.safeParse(value)
      return parsed.success ? [[key, parsed.data]] : []
    }),
  )
}

// What the image provider gets of model_params: everything but the fragments, which only feed
// renderPrompt, and a poster template's private extraction instructions (ARCHITECTURE §5.3),
// which only the text model reads.
export function providerParams(modelParams: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...modelParams }
  delete rest.toggles
  delete rest.poster_extract
  return rest
}

const hasPlaceholder = (body: string, key: string) => new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`).test(body)

// The admin save's refusals (T89): every toggle needs its {{key}} in the prompt body and both an
// "on" and an "off" fragment, neither holding a placeholder of its own (renderPrompt inserts a
// fragment as it is, so `{{` would reach the model raw). Chinese messages: only the admin editor
// shows them (DESIGN §7).
export function toggleSetupProblems(toggles: readonly ToggleField[], body: string, modelParams: Record<string, unknown>): string[] {
  const fragments = toggleFragments(modelParams)
  return toggles.flatMap((toggle) => {
    const problems: string[] = []
    if (!hasPlaceholder(body, toggle.key)) problems.push(`开关 ${toggle.key}：提示词正文里没有占位符 {{${toggle.key}}}`)
    const own = fragments[toggle.key]
    if (!own?.on.trim()) problems.push(`开关 ${toggle.key}：缺「开」那段（model_params.toggles.${toggle.key}.on）`)
    if (!own?.off.trim()) problems.push(`开关 ${toggle.key}：缺「关」那段（model_params.toggles.${toggle.key}.off）`)
    if (own && (own.on.includes('{{') || own.off.includes('{{'))) problems.push(`开关 ${toggle.key}：「开」「关」两段里不能有 {{ 占位符`)
    return problems
  })
}
