import 'server-only'
import { headers } from 'next/headers'

import { serverEnv } from './env'
import { resolveRequestOrigin } from './preview-hosts'
import { appOrigin } from './site-url'

function originForHost(host: string | null): string {
  const env = serverEnv()
  return resolveRequestOrigin(host, { vercelEnv: env.VERCEL_ENV, appOrigin, extraHosts: env.PREVIEW_EXTRA_HOSTS })
}

// For anything the browser follows or that must match where the visitor is signed in: auth
// redirects and email links, same-origin checks, checkout and portal return URLs. Links that
// leave the session (alerts, partner reports, partner API) keep appOrigin.
export function requestOrigin(request: { headers: Headers }): string {
  return originForHost(request.headers.get('host'))
}

// Server actions and server components, which have no request object.
export async function currentOrigin(): Promise<string> {
  return originForHost((await headers()).get('host'))
}
