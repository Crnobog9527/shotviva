// Where the QA scripts may write (T24). Pure on purpose: the guard is unit-tested
// (target.test.ts) and runs before any client is created.

// shotviva-preview, the project behind the validation preview deployment.
export const PREVIEW_REF = 'pnzkiqvktkzznfbyhphe'

// Refused even when listed in QA_EXTRA_SUPABASE_REFS. The production project does not exist
// yet (LAUNCH_CHECKLIST); its ref goes here the day it is created.
export const PRODUCTION_REFS: readonly string[] = []

export const DEFAULT_SITE_URL = 'https://shotviva-git-validation-preview-simons-projects-bfe3e99f.vercel.app'

// `local` stands for a `supabase start` stack on this machine (127.0.0.1 / localhost).
export const LOCAL_REF = 'local'

const REF_PATTERN = /^[a-z0-9]{20}$/
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]'])

export class QaGuardError extends Error {}

function refFromUrl(raw: string): string {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new QaGuardError('NEXT_PUBLIC_SUPABASE_URL is not a URL.')
  }
  if (LOCAL_HOSTS.has(url.hostname)) return LOCAL_REF
  const match = /^([a-z0-9]{20})\.supabase\.co$/.exec(url.hostname)
  if (url.protocol !== 'https:' || !match) {
    throw new QaGuardError(`Supabase host ${url.hostname} is not a <ref>.supabase.co project.`)
  }
  return match[1]
}

export function parseExtraRefs(raw: string | undefined): string[] {
  const refs = (raw ?? '').split(',').map((ref) => ref.trim()).filter(Boolean)
  for (const ref of refs) {
    if (ref !== LOCAL_REF && !REF_PATTERN.test(ref)) {
      throw new QaGuardError(`QA_EXTRA_SUPABASE_REFS has an invalid entry: ${ref}`)
    }
  }
  return refs
}

// Legacy service-role keys are JWTs naming their project; a key from another project (say
// production) next to the preview URL is refused rather than tried. sb_secret_ keys carry no
// claims and are only checked by the URL.
function jwtClaims(key: string): { ref?: unknown; role?: unknown } | null {
  const parts = key.split('.')
  if (parts.length !== 3) return null
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as { ref?: unknown; role?: unknown }
  } catch {
    return null
  }
}

function checkKey(ref: string, serviceKey: string): void {
  if (serviceKey.startsWith('sb_publishable_')) throw new QaGuardError('SUPABASE_SERVICE_ROLE_KEY is a publishable key.')
  const claims = jwtClaims(serviceKey)
  if (!claims) return
  if (claims.role !== 'service_role') throw new QaGuardError('SUPABASE_SERVICE_ROLE_KEY is not a service-role key.')
  if (ref !== LOCAL_REF && typeof claims.ref === 'string' && claims.ref !== ref) {
    throw new QaGuardError('SUPABASE_SERVICE_ROLE_KEY belongs to a different project than NEXT_PUBLIC_SUPABASE_URL.')
  }
}

export type GuardInput = { supabaseUrl: string; serviceKey: string; extraRefs?: string }

// Returns the project ref, or throws. Order matters: the production deny list wins over
// anything an environment variable adds.
export function assertQaTarget(input: GuardInput): string {
  const ref = refFromUrl(input.supabaseUrl)
  if (PRODUCTION_REFS.includes(ref)) throw new QaGuardError(`Refusing to run against production (${ref}).`)
  const allowed = [PREVIEW_REF, ...parseExtraRefs(input.extraRefs)]
  if (!allowed.includes(ref)) {
    throw new QaGuardError(`Refusing to run against ${ref}: only ${allowed.join(', ')} allowed.`)
  }
  checkKey(ref, input.serviceKey)
  return ref
}

// The site the login link opens. Preview deployments (*.vercel.app) or a local dev server;
// never the production domain, where a preview token hash would not work anyway.
export function resolveSiteUrl(raw: string | undefined, ref: string): string {
  let url: URL
  try {
    url = new URL(raw || DEFAULT_SITE_URL)
  } catch {
    throw new QaGuardError('QA_SITE_URL is not a URL.')
  }
  const local = LOCAL_HOSTS.has(url.hostname)
  const preview = url.protocol === 'https:' && url.hostname.endsWith('.vercel.app')
  if (!local && !preview) throw new QaGuardError(`QA_SITE_URL must be a *.vercel.app preview or localhost, not ${url.hostname}.`)
  if (ref === LOCAL_REF && !local) throw new QaGuardError('A local Supabase only signs in on a local site; set QA_SITE_URL.')
  return url.origin
}
