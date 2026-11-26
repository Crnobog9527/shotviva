import { requireAdmin } from '@/core/auth'
import { probeArk } from '@/core/providers/ark-probe'

export const maxDuration = 60

// Can this deployment's default region reach Ark Beijing? Admin only, no key sent (ark-probe.ts).
export async function GET() {
  await requireAdmin()
  return Response.json(await probeArk(), { headers: { 'Cache-Control': 'private, no-store' } })
}
