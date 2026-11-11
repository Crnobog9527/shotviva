import { z } from 'zod'

// A bare lower-case hostname (`shotviva-qa-admin.vercel.app`): no scheme, port or path.
const HOSTNAME = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/

export const previewHostsShape = {
  // Extra hostnames bound to the test-site branch, comma-separated, so several windows can stay
  // signed in as different accounts in one browser (cookies are per host). Only read when
  // VERCEL_ENV is 'preview'; production never trusts the Host header.
  PREVIEW_EXTRA_HOSTS: z.preprocess(
    (value) =>
      typeof value === 'string'
        ? value.split(',').map((host) => host.trim().toLowerCase()).filter(Boolean)
        : [],
    z.array(z.string().regex(HOSTNAME)),
  ),
}

export type RequestOriginEnv = {
  vercelEnv: string | undefined
  // core/site-url appOrigin: the branch URL on a preview, the canonical domain in production.
  appOrigin: string
  extraHosts: readonly string[]
}

// The origin a request is answered from: its own host when that host is on the preview
// allow-list, otherwise appOrigin. The Host header is client-controlled, so it is only ever
// compared against the explicit list; an unknown or spoofed host gets appOrigin, exactly as
// before, and nothing outside a preview changes. Pure so every branch is unit-tested.
export function resolveRequestOrigin(host: string | null, env: RequestOriginEnv): string {
  if (env.vercelEnv !== 'preview' || !host) return env.appOrigin
  const name = host.toLowerCase()
  return env.extraHosts.includes(name) ? `https://${name}` : env.appOrigin
}
