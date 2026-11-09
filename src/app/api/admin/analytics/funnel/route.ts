import { funnelEnd, funnelParams, funnelResponse, posthogProjectId } from '@/core/admin/analytics'
import { requireAdmin } from '@/core/auth'

export async function GET(request: Request) {
  await requireAdmin()
  const params = funnelParams.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  const headers = { 'Cache-Control': 'private, no-store' }
  if (!params.success) return Response.json({end: funnelEnd()}, {status: 400, headers})
  const projectId = posthogProjectId()
  if (!projectId) return new Response(null, {status: 503, headers})
  const {range, group, end} = params.data
  const result = await funnelResponse(projectId, range, group, end)
  return Response.json(result, {status: result ? 200 : 503, headers})
}
