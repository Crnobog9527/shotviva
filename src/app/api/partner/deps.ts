import 'server-only'

import type { NextResponse } from 'next/server'

import { createAdminSupabase } from '@/core/auth'
import { serverEnv } from '@/core/env'
import { partnerErrorResponse, type PartnerGenerateRouteDeps, type PartnerRouteDeps } from '@/core/partner'
import { appOrigin } from '@/core/site-url'
import { r2Store } from '@/core/storage'
import { openaiImageProvider } from '@/modules/image'
import { site } from '@/site/site.config'

// Wiring for /api/partner/*: service-role db (no user session on these routes, ARCHITECTURE
// §14.3), R2, this environment's partner key and the allowlists from site config.
function partnerDeps(): PartnerRouteDeps {
  return {
    db: createAdminSupabase(),
    store: r2Store(),
    env: serverEnv(),
    origin: appOrigin,
    config: site.partners.graylum,
  }
}

function partnerGenerateDeps(): PartnerGenerateRouteDeps {
  return { ...partnerDeps(), provider: openaiImageProvider() }
}

// A missing secret throws while wiring; answer that in the partner error shape too.
function withDeps<D>(make: () => D, route: string, run: (deps: D) => Promise<NextResponse>): Promise<NextResponse> | NextResponse {
  let deps: D
  try {
    deps = make()
  } catch (error) {
    return partnerErrorResponse(error, { route })
  }
  return run(deps)
}

export const withPartnerDeps = (route: string, run: (deps: PartnerRouteDeps) => Promise<NextResponse>) =>
  withDeps(partnerDeps, route, run)

export const withPartnerGenerateDeps = (route: string, run: (deps: PartnerGenerateRouteDeps) => Promise<NextResponse>) =>
  withDeps(partnerGenerateDeps, route, run)
