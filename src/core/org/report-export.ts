import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '@/core/errors'

import { accountLabels } from './console/reads'
import { customerReportCsv, memberReportCsv, type CustomerHeaders, type MemberHeaders } from './report-csv'
import { readMemberStats, readOrgCustomers } from './stats'

// The owner's CSV downloads (ARCHITECTURE §6.5, card E5): the member table of a month, and the
// customers behind it. Owner only: the account must own an org (anyone else gets NOT_FOUND, the
// route answers 404 like the console page) and both SQL functions check it again. Nothing here
// reads a customer's address: the customer function already masks it.

export type ReportKind = 'members' | 'customers'

export type ReportLabels = {
  members: MemberHeaders
  customers: CustomerHeaders
  total: string
  owner: string
  staff: string
  active: string
  removed: string
  unknown: string
}

type Deps = { db: SupabaseClient; user: string; period: string; kind: ReportKind; labels: ReportLabels; maskPhone: (phone: string) => string }

const orgSchema = z.object({ id: z.uuid(), affiliate_enabled: z.boolean(), affiliate_levels: z.union([z.literal(1), z.literal(2)]) })

export async function buildOrgReport({ db, user, period, kind, labels, maskPhone }: Deps): Promise<{ filename: string; body: string }> {
  const { data, error } = await db.from('orgs').select('id,affiliate_enabled,affiliate_levels').eq('owner_user_id', user).maybeSingle()
  if (error) throw new AppError('INTERNAL', 'org report read failed', { cause: new Error(error.message) })
  if (!data) throw new AppError('NOT_FOUND', 'Not found')
  const org = orgSchema.parse(data)
  const [rows, customers] = await Promise.all([
    readMemberStats(db, user, org.id, period),
    kind === 'customers' ? readOrgCustomers(db, user, period) : Promise.resolve([]),
  ])
  const names = await accountLabels(db, rows.map((r) => r.userId), maskPhone)
  const nameOf = (id: string) => names.get(id) ?? labels.unknown
  if (kind === 'customers') {
    const body = customerReportCsv(
      customers.map((c) => ({ member: nameOf(c.memberUserId), level: c.level, contact: c.contact, signedUpAt: c.signedUpAt, paidInPeriodCents: c.paidInPeriodCents, paidTotalCents: c.paidTotalCents })),
      labels.customers,
    )
    return { filename: `customers-${period}.csv`, body }
  }
  const body = memberReportCsv(
    rows.map((r) => ({
      account: nameOf(r.userId), role: r.role === 'owner' ? labels.owner : labels.staff, status: r.status === 'active' ? labels.active : labels.removed,
      allocated: r.allocated, used: r.used, l1: r.l1, l2: r.l2,
    })),
    labels.members, labels.total, org.affiliate_enabled && org.affiliate_levels === 2,
  )
  // Without the affiliate program the table is the month's usage (Owner 2026-11-28).
  return { filename: `${org.affiliate_enabled ? 'performance' : 'usage'}-${period}.csv`, body }
}
