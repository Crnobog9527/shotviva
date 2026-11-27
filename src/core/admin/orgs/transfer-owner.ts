import 'server-only'

import { z } from 'zod'

import { adminTransferOrgOwner } from '@/core/org'

import type { OrgDeps } from './commands'
import { TRANSFER_COPY as COPY } from './transfer-copy'
import type { OrgActionResult } from './types'

const schema = z.object({ orgId: z.uuid(), userId: z.uuid(), expectedUpdatedAt: z.string().min(1).max(64) })

// 更换主管理员: the SQL (1930) checks the admin, the new owner, the stale form and moves the org's
// affiliate account with the org. Refusals are mapped to text by orgFailure.
export async function transferOrgOwner(deps: OrgDeps, input: unknown): Promise<OrgActionResult<{ applied: boolean }>> {
  const form = schema.parse(input)
  const result = await adminTransferOrgOwner(deps.db, deps.actor, form.orgId, form.userId, form.expectedUpdatedAt)
  if (!result.applied) return { ok: true, message: COPY.already, value: { applied: false } }
  return { ok: true, message: COPY.done(result.affiliate, result.removed_personal ?? null), value: { applied: true } }
}
