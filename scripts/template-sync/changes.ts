import { z } from 'zod'

import { SyncError } from './covers'
import { readSeries } from './series'
import { readStates } from './state'
import type { SyncRequest } from './plan'
import type { SyncTarget } from './sync'

// What a production → preview run would change (2026-11-14), per template, before the dry run's
// rolled-back writes: the names of the columns, prompt parts and states that differ, never their
// values (prompts are private). Covers are stored per site, so only whether a slot is filled counts;
// sort order and featured rank are never synced and are not compared.

const COVER_SLOTS = ['cover_before_url', 'cover_after_url', 'cover_video_url', 'cover_poster_url']
const snapshotSchema = z.object({
  template: z.record(z.string(), z.unknown()),
  prompt: z.object({ body: z.string(), version: z.int(), model_params: z.unknown() }).nullable(),
  provider: z.unknown(),
}).nullable()

export const stable = (value: unknown): string => JSON.stringify(sortKeys(value ?? null))
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => [k, sortKeys(v)]))
}

// Which cover slots are filled, per locale too: the shape without the per-site addresses.
const coverShape = (value: unknown): unknown => (typeof value === 'string' ? value !== '' : Array.isArray(value)
  ? value.map(coverShape) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, coverShape(v)])) : value)

async function snapshot(id: string, side: SyncTarget) {
  const read = await side.db.rpc('read_template_sync_source', { p_id: id })
  if (read.error) throw new SyncError('READ_FAILED')
  return snapshotSchema.parse(read.data)
}

async function extras(id: string, version: number | undefined, side: SyncTarget) {
  if (version === undefined) return { refs: null, profiles: null }
  const [refs, profiles] = await Promise.all([
    side.db.rpc('read_template_sync_style_refs', { p_id: id, p_version: version }),
    side.db.rpc('read_template_sync_profiles', { p_id: id, p_version: version }),
  ])
  return { refs: refs.error ? 'unreadable' : refs.data, profiles: profiles.error ? 'unreadable' : profiles.data }
}

export function changedKeys(from: Record<string, unknown>, to: Record<string, unknown>) {
  const keys = [...new Set([...Object.keys(from), ...Object.keys(to)])].filter(key => key !== 'id').sort()
  return keys.filter((key) => {
    const cover = COVER_SLOTS.includes(key) || key === 'cover_locales'
    return cover ? stable(coverShape(from[key])) !== stable(coverShape(to[key])) : stable(from[key]) !== stable(to[key])
  })
}

export async function describeTemplate(id: string, source: SyncTarget, target: SyncTarget) {
  const [from, to] = await Promise.all([snapshot(id, source), snapshot(id, target)])
  if (!from) return 'missing on production'
  if (!to) return 'new on the preview'
  const [a, b] = await Promise.all([extras(id, from.prompt?.version, source), extras(id, to.prompt?.version, target)])
  const changed = changedKeys(from.template, to.template)
  if (from.prompt?.body !== to.prompt?.body) changed.push('prompt.body')
  if (stable(from.prompt?.model_params) !== stable(to.prompt?.model_params)) changed.push('prompt.model_params')
  if (stable(from.provider) !== stable(to.provider)) changed.push('provider')
  if (stable(a.refs) !== stable(b.refs)) changed.push('style_refs')
  if (stable(a.profiles) !== stable(b.profiles)) changed.push('profiles')
  return changed.length ? `changes: ${changed.join(', ')}` : 'content unchanged'
}

// One line per template the request covers (series members included), plus 上下架 and 开放售卖.
export async function describeRequest(request: SyncRequest, source: SyncTarget, target: SyncTarget, report: (line: string) => void) {
  const members = await Promise.all(request.seriesSlugs.map(slug => readSeries(slug, source).then(s => s.members).catch(() => [])))
  const ids = [...new Set([...request.templateIds, ...members.flat()])]
  const [fromStates, toStates] = await Promise.all([readStates(ids, source), readStates(ids, target)])
  for (const id of ids) {
    let line: string
    try {
      line = await describeTemplate(id, source, target)
    } catch (error) {
      line = error instanceof SyncError ? error.message : 'READ_FAILED'
    }
    const [from, to] = [fromStates.get(id), toStates.get(id)]
    const state = from && to && (from.active !== to.active || from.sale !== to.sale)
      ? `; state ${to.active ? 'live' : 'draft'}/${to.sale ? 'sale' : 'no sale'} -> ${from.active ? 'live' : 'draft'}/${from.sale ? 'sale' : 'no sale'}` : ''
    report(`plan ${id}: ${line}${state}`)
  }
}
