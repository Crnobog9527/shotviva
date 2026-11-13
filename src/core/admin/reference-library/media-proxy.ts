import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { currentProxyUser } from '@/core/auth/proxy-gates'
import { createAdminSupabase } from '@/core/auth/supabase-admin'
import { hasSessionCookie, withCookies } from '@/core/auth/update-session'
import { r2Store } from '@/core/storage/r2-store'

const headers = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
}
const empty = (status: number) => new NextResponse(null, { status, headers })

async function streamReference(id: string, request: NextRequest, result: boolean) {
  const db = createAdminSupabase()
  const key = result ? `prompt-lab/outputs/${id}.png` : `references/${id}.webp`
  const row = result
    ? db.from('prompt_lab_runs').select('id').eq('id', id).eq('status', 'succeeded').eq('output_key', key)
    : db.from('reference_assets').select('id').eq('id', id)
  const { data, error } = await row.maybeSingle()
  if (error) return empty(503)
  if (!data) return empty(404)
  const signed = await r2Store().presignGet(key, { expiresInSeconds: 60 })
  // A rewrite or 302 can expose its upstream URL. Stream the private response in the
  // authenticated media proxy; never forward the browser's cookies, RSC or auth headers.
  const upstream = await fetch(signed, { cache: 'no-store', redirect: 'error', signal: request.signal })
  if (!upstream.ok || !upstream.body) {
    await upstream.body?.cancel()
    return empty(upstream.status === 404 ? 404 : 502)
  }
  return new NextResponse(upstream.body, { headers: { ...headers, 'Content-Type': result ? 'image/png' : 'image/webp' } })
}

export async function referenceMedia(request: NextRequest) {
  const path = request.nextUrl.pathname
  const result = path.startsWith('/admin-media/prompt-lab/')
  const id = z.uuid().safeParse(path.slice((result ? '/admin-media/prompt-lab/' : '/admin-media/references/').length))
  if (!id.success || request.method !== 'GET' || !hasSessionCookie(request)) return empty(404)
  return adminOnly(request, (session) => streamReference(id.data, request, result).then((answer) => withCookies(answer, session())))
}

// The session check may have refreshed and rotated the session: every answer from here on, the
// 503 included, carries its cookies, or the browser keeps a refresh token Auth already used
// (ARCHITECTURE §7「会话校验」).
async function adminOnly(request: NextRequest, serve: (session: () => NextResponse) => Promise<NextResponse>) {
  let session: (() => NextResponse) | null = null
  try {
    const { user, response } = await currentProxyUser(request)
    session = response
    if (user?.role !== 'admin' || !user.verified || user.banned) return withCookies(empty(404), response())
    return await serve(response)
  } catch {
    // In particular, keep signed upstream URLs out of exception logs and browser responses.
    return session ? withCookies(empty(503), session()) : empty(503)
  }
}
