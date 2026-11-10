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

async function streamReference(id: string, request: NextRequest) {
  const { data, error } = await createAdminSupabase().from('reference_assets').select('id').eq('id', id).maybeSingle()
  if (error) return empty(503)
  if (!data) return empty(404)
  const signed = await r2Store().presignGet(`references/${id}.webp`, { expiresInSeconds: 60 })
  // A rewrite or 302 can expose its upstream URL. Stream the private response in the
  // authenticated media proxy; never forward the browser's cookies, RSC or auth headers.
  const upstream = await fetch(signed, { cache: 'no-store', redirect: 'error', signal: request.signal })
  if (!upstream.ok || !upstream.body) {
    await upstream.body?.cancel()
    return empty(upstream.status === 404 ? 404 : 502)
  }
  return new NextResponse(upstream.body, { headers: { ...headers, 'Content-Type': 'image/webp' } })
}

export async function referenceMedia(request: NextRequest) {
  const id = z.uuid().safeParse(request.nextUrl.pathname.slice('/admin-media/references/'.length))
  if (!id.success || request.method !== 'GET' || !hasSessionCookie(request)) return empty(404)
  try {
    const { user, response } = await currentProxyUser(request)
    if (user?.role !== 'admin' || !user.verified) return withCookies(empty(404), response())
    return withCookies(await streamReference(id.data, request), response())
  } catch {
    // In particular, keep signed upstream URLs out of exception logs and browser responses.
    return empty(503)
  }
}
