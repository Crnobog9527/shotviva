import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import type { ObjectStore } from '@/core/storage'

// What the user typed and chose for one job, for the admin 「查看作品」 dialog (debugging a user's
// complaint). Only the user's own words and options leave here: the edit instruction, the
// template's text boxes, the optional note and the on/off options. The template's prompts, model
// params and the classifier's answer stay in the database. All of it already sits in
// generation_jobs.inputs (a template generation's copy / note / toggles, an edit's instruction),
// so nothing new is stored; works made before those keys existed simply show nothing.

// kind decides the heading in the UI; a text box carries the template's own label.
export type UserInputEntry = { kind: 'instruction' | 'note' | 'copy'; label: string | null; value: string }
export type UserInputOption = { label: string; on: boolean }
export type WorkUserInput = { isEdit: boolean; entries: UserInputEntry[]; options: UserInputOption[] }

export const EMPTY_USER_INPUT: WorkUserInput = { isEdit: false, entries: [], options: [] }

const textOf = (value: unknown): string | null => {
  if (typeof value === 'string') return value.trim() ? value : null
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : null
}

const jobSchema = z.object({
  template_id: z.string(),
  parent_job_id: z.string().nullable().catch(null),
  instruction: z.unknown(),
  note: z.unknown(),
  copy: z.unknown(),
  toggles: z.unknown(),
})

const labelled = z.array(z.object({ key: z.string(), label: z.string().optional() }).loose()).catch([])
const templateSchema = z.object({
  copy: labelled.optional().catch(undefined),
  toggles: labelled.optional().catch(undefined),
  zh: z.object({ fields: z.record(z.string(), z.object({ label: z.string().optional() }).loose()).optional() }).optional().catch(undefined),
})

type Labels = { copy: Map<string, string>; toggles: Map<string, string> }

// Chinese label where the template has one (the admin reads Chinese), else its English one.
async function templateLabels(db: SupabaseClient, templateId: string): Promise<Labels> {
  const { data } = await db.from('templates').select('fields, translations').eq('id', templateId).maybeSingle()
  const row = data as { fields?: unknown; translations?: unknown } | null
  const fields = templateSchema.safeParse({
    ...(typeof row?.fields === 'object' && row.fields ? row.fields : {}),
    zh: typeof row?.translations === 'object' && row.translations ? (row.translations as { zh?: unknown }).zh : undefined,
  })
  const parsed = fields.success ? fields.data : {}
  const zh = parsed.zh?.fields ?? {}
  const toMap = (list: { key: string; label?: string }[] = []) => new Map(list.map((f) => [f.key, zh[f.key]?.label || f.label || f.key]))
  return { copy: toMap(parsed.copy), toggles: toMap(parsed.toggles) }
}

// jsonb stores object keys in its own order; show the fields in the template's order, unknown keys last.
const inTemplateOrder = <T>(items: [string, T][], known: Map<string, string>): [string, T][] => {
  const order = [...known.keys()]
  const rank = (key: string) => (order.includes(key) ? order.indexOf(key) : order.length)
  return [...items].sort(([a], [b]) => rank(a) - rank(b))
}

function copyEntries(copy: unknown, labels: Labels): UserInputEntry[] {
  if (typeof copy !== 'object' || copy === null || Array.isArray(copy)) return []
  return inTemplateOrder(Object.entries(copy), labels.copy).flatMap(([key, raw]) => {
    const value = textOf(raw)
    return value === null ? [] : [{ kind: 'copy' as const, label: labels.copy.get(key) ?? key, value }]
  })
}

function toggleOptions(toggles: unknown, labels: Labels): UserInputOption[] {
  if (typeof toggles !== 'object' || toggles === null || Array.isArray(toggles)) return []
  return inTemplateOrder(Object.entries(toggles), labels.toggles).flatMap(([key, on]) => (typeof on === 'boolean' ? [{ label: labels.toggles.get(key) ?? key, on }] : []))
}

// Reads straight after the audited admin_view_work call; the user's text is never logged here.
export async function readUserInput(db: SupabaseClient, jobId: string): Promise<{ input: WorkUserInput; parentJobId: string | null }> {
  const { data, error } = await db
    .from('generation_jobs')
    .select('template_id, parent_job_id, instruction:inputs->instruction, note:inputs->note, copy:inputs->copy, toggles:inputs->toggles')
    .eq('id', jobId)
    .maybeSingle()
  const job = error || !data ? null : jobSchema.safeParse(data)
  if (!job?.success) return { input: EMPTY_USER_INPUT, parentJobId: null }
  const labels = await templateLabels(db, job.data.template_id)
  const instruction = textOf(job.data.instruction)
  const note = textOf(job.data.note)
  const entries: UserInputEntry[] = [
    ...(instruction ? [{ kind: 'instruction' as const, label: null, value: instruction }] : []),
    ...copyEntries(job.data.copy, labels),
    ...(note ? [{ kind: 'note' as const, label: null, value: note }] : []),
  ]
  return {
    input: { isEdit: job.data.parent_job_id !== null, entries, options: toggleOptions(job.data.toggles, labels) },
    parentJobId: job.data.parent_job_id,
  }
}

// The work an edit started from: the user's own finished, not deleted work only; its clean output.
export async function sourceWorkLink(db: SupabaseClient, store: ObjectStore, userId: string, parentJobId: string | null, expiresInSeconds: number) {
  if (!parentJobId) return null
  const { data } = await db.from('generation_jobs').select('user_id, status, output_key, deleted_at').eq('id', parentJobId).maybeSingle()
  const parent = data as { user_id: string; status: string; output_key: string | null; deleted_at: string | null } | null
  if (!parent || parent.user_id !== userId || parent.status !== 'succeeded' || !parent.output_key || parent.deleted_at) return null
  return store.presignGet(parent.output_key, { expiresInSeconds })
}
