import type { NextRequest } from 'next/server'
import { z } from 'zod'

import { labCommand } from '@/core/admin/prompt-lab/commands'
import { readLabRuns, readLabVersions, versionDetail } from '@/core/admin/prompt-lab/store'
import { readInput } from '@/core/admin/reference-library/inputs'
import { errorResponse, jsonResponse } from '@/core/api-response'
import { assertSameOrigin, createAdminSupabase, requireApiAdmin } from '@/core/auth'

const sessionId = z.uuid()
const cursor = z.string().max(300).optional()
const query = z.discriminatedUnion('view', [
  z.object({ view: z.literal('version'), sessionId, id: z.uuid() }),
  z.object({ view: z.enum(['versions', 'runs']), sessionId, cursor }),
])

export async function GET(req: NextRequest) {
  try {
    await requireApiAdmin()
    const p = readInput(query, Object.fromEntries(req.nextUrl.searchParams))
    const db = createAdminSupabase()
    if (p.view === 'version') return jsonResponse(await versionDetail(db, p.sessionId, p.id))
    const load = p.view === 'runs' ? readLabRuns : readLabVersions
    return jsonResponse(await load(db, p.sessionId, p.cursor))
  } catch (e) { return errorResponse(e, 'admin-prompt-lab-read') }
}

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req)
    const actor = await requireApiAdmin()
    return jsonResponse(await labCommand(createAdminSupabase(), actor.id, await req.json().catch(() => null)))
  } catch (e) { return errorResponse(e, 'admin-prompt-lab-write') }
}
