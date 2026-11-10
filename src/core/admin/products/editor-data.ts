import 'server-only'
import { z } from 'zod'
import type { RpcClient } from '../../billing/rpc'
import { callRpc } from '../../billing/rpc'
import { editor, pageRows, terms } from './model'

export async function readEditor(db: RpcClient, actor: string, product: string, before?: string, beforeId?: string) {
  return callRpc(db, 'admin_catalog_editor', { p_actor: actor, p_product: product,
    ...(before && beforeId ? { p_before: z.iso.datetime({ offset: true }).parse(before), p_before_id: z.uuid().parse(beforeId) } : {}) }, editor.nullable())
}
export async function readPage(db: RpcClient, actor: string, after: string) {
  try {
    return await callRpc(db, 'admin_catalog_page', { p_actor: actor, p_after: after }, pageRows)
  } catch (error) {
    const missing = z.object({ code: z.literal('PGRST202') }).safeParse(error instanceof Error ? error.cause : null)
    if (missing.success) return null
    throw error
  }
}
export function readRelease(db: RpcClient, actor: string, product: string, id?: string) {
  return callRpc(db, 'admin_catalog_release', { p_actor: actor, p_product: product, p_id: id ? z.uuid().parse(id) : null },
    z.object({ id: z.uuid(), revision: z.int() }).nullable())
}
const text = z.string().trim().min(1).max(500)
export async function saveDraft(db: RpcClient, actor: string, product: string, f: FormData) {
  const money = z.string().regex(/^\d{1,7}(\.\d{1,2})?$/).parse(f.get('usd'))
  const parsed = terms.omit({ revision: true }).parse({
    usd_cents: Math.round(Number(money) * 100), credits: Number(f.get('credits')), listed: f.get('listed') === 'on',
    name_en: f.get('name_en'), name_zh: f.get('name_zh'), benefit_en: f.get('benefit_en'), benefit_zh: f.get('benefit_zh'), sort_order: Number(f.get('sort_order')),
  })
  return callRpc(db, 'admin_catalog_save', { p_actor: actor,p_product: product,p_base: f.get('base') ? z.coerce.number().int().positive().parse(f.get('base')) : null,
    p_previous: f.get('previous') ? z.uuid().parse(f.get('previous')) : null, p_terms: { ...parsed, ...(f.has('tier') && { tier: z.enum(['pack','starter','pro','max']).parse(f.get('tier')) }) }, p_reason: text.parse(f.get('reason')) }, z.uuid())
}
