import { z } from 'zod'

import { publishBlockers } from '../../src/core/admin/templates/publish-rules'
import { loadPublishCandidates } from '../../src/core/admin/templates/repository'
import { site } from '../../src/site/site.config'
import { readTemplateFloors } from '../../src/site/template-pricing'
import { SyncError } from './covers'
import { rpcError } from './rpc-error'
import type { SyncTarget } from './sync'

// 上下架 and 开放售卖 follow the test site (Owner 2026-11-12), through production's own checks. The
// admin's 上架 switch rules (publishBlockers) run here first, judged as if the sale were already open
// since the same call opens it; the SQL function then opens the sale with the admin's own function,
// publishes under every database check, and audits each change, all or nothing.

// `deleted`: 删除 on the test site (1381); production unpublishes and deletes it too.
export type TemplateState = { active: boolean; sale: boolean; deleted: boolean }
export type SyncActor = { id: string; runId: string }

const stateRows = z.array(z.object({
  id: z.string(), is_active: z.boolean(), deleted_at: z.string().nullable(), template_sale_approvals: z.object({ enabled: z.boolean() }).nullable(),
}))

// The test site's state for these templates (one read).
export async function readStates(ids: readonly string[], source: SyncTarget) {
  if (ids.length === 0) return new Map<string, TemplateState>()
  const { data, error } = await source.db.from('templates').select('id, is_active, deleted_at, template_sale_approvals(enabled)').in('id', [...ids])
  if (error) throw new SyncError('SOURCE_READ_FAILED')
  return new Map(stateRows.parse(data).map((row) => [row.id, {
    active: row.is_active, sale: row.template_sale_approvals?.enabled === true, deleted: row.deleted_at !== null,
  }]))
}

// Refuses, before any write, a publication the admin switch would refuse on production.
async function assertPublishable(id: string, target: SyncTarget) {
  const [candidate] = await loadPublishCandidates(target.db, [id]).catch(() => { throw new SyncError('TARGET_READ_FAILED') })
  if (!candidate || candidate.isActive) return
  const blockers = publishBlockers({ ...candidate, saleEnabled: true }, await readTemplateFloors(target.db))
  if (blockers.length > 0) throw new SyncError(`PUBLISH_BLOCKED ${blockers.join(',')}`)
}

const outcome = z.object({ sale: z.string(), active: z.string() })

export async function syncTemplateState(id: string, desired: Pick<TemplateState, 'active' | 'sale'>, actor: SyncActor, target: SyncTarget, validateOnly: boolean) {
  if (desired.active) await assertPublishable(id, target)
  const write = await target.db.rpc('sync_preview_template_state', {
    p_actor: actor.id, p_id: id, p_sale: desired.sale, p_active: desired.active, p_run_id: actor.runId,
    p_locales: site.locales.enabled, p_validate_only: validateOnly,
  })
  if (write.error) throw rpcError(write.error, 'STATE_WRITE')
  const { sale, active } = outcome.parse(write.data)
  return `sale ${sale}, ${active}`
}

// A template deleted on the test site: unpublished on production (which takes it out of its series,
// 1380), then deleted with production's own admin function, audited as the sync actor. Production
// keeps the row, as the test site does. Nothing to do when production never had it.
export async function syncTemplateDelete(id: string, sale: boolean, actor: SyncActor, target: SyncTarget, validateOnly: boolean) {
  const exists = await target.db.from('templates').select('id').eq('id', id).maybeSingle()
  if (exists.error) throw new SyncError('TARGET_READ_FAILED')
  if (!exists.data) return 'deleted on the test site, absent here'
  const unpublished = await syncTemplateState(id, { active: false, sale }, actor, target, validateOnly)
  if (validateOnly) return `${unpublished}, would delete`
  const write = await target.db.rpc('admin_delete_template', { p_actor: actor.id, p_id: id })
  if (write.error) throw rpcError(write.error, 'DELETE_WRITE')
  return `${unpublished}, ${z.boolean().parse(write.data) ? 'deleted' : 'already deleted'}`
}

export async function syncSeriesActive(slug: string, active: boolean, actor: SyncActor, target: SyncTarget, validateOnly: boolean) {
  const write = await target.db.rpc('sync_preview_series_active', {
    p_actor: actor.id, p_slug: slug, p_active: active, p_run_id: actor.runId, p_validate_only: validateOnly,
  })
  if (write.error) throw rpcError(write.error, 'SERIES_STATE_WRITE')
  return z.string().parse(write.data)
}
