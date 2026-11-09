import 'server-only'
import { notFound } from 'next/navigation'
import { requireAdmin } from '@/core/auth'
import { isAffiliateEnabled } from '@/core/affiliate/feature'

export async function requireAffiliateAdmin() {
  const admin = await requireAdmin()
  if (!(await isAffiliateEnabled())) notFound()
  return admin
}
