import { requireAdmin } from '@/core/auth'
import { probeArk } from '@/core/providers/ark-probe'

export const maxDuration = 60

// The same probe pinned to Vercel's Hong Kong region (vercel.json "functions"), to see whether
// moving image generation closer to Beijing would reach Ark.
export async function GET() {
  await requireAdmin()
  return Response.json(await probeArk(), { headers: { 'Cache-Control': 'private, no-store' } })
}
