import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { NextResponse } from 'next/server'

import type { PartnerSiteConfig } from '../config'
import { findOwnJob } from '../jobs'
import type { ObjectStore } from '../storage'
import { DEFAULT_LOCALE, isLocale } from '../i18n/locales'
import { listTemplates, withLocaleCover } from '../templates'
import { exchangeLinkCode } from './link-code'
import { assertPartnerKey, authenticatePartner, type PartnerKeyEnv } from './partner-auth'
import { partnerErrorResponse, partnerJson, PartnerError } from './partner-error'
import {
  accountQuerySchema,
  linkRequestSchema,
  type AccountResponse,
  type LinkResponse,
  type TemplatesResponse,
} from './partner-types'
import { partnerDisplayName, partnerImageUrl, partnerProfile, toJobResponse, toPartnerTemplate } from './partner-views'
import { allowlistedUrl, topUpUrl } from './return-to'

// Route logic for the four small /api/partner/* routes; app/api/partner/* only wires deps.
export type PartnerRouteDeps = {
  db: SupabaseClient
  store: ObjectStore
  env: PartnerKeyEnv
  // This deployment's origin, for top_up_url.
  origin: string
  config: PartnerSiteConfig
  now?: () => Date
}

const invalid = (message: string) => new PartnerError('invalid_input', message)

// return_to is optional, but a given one must be allowlisted: silently dropping it would send
// the user to a dead end after paying.
export function checkedReturnTo(value: string | undefined, config: PartnerSiteConfig): string | null {
  if (value === undefined) return null
  if (!allowlistedUrl(value, config.returnToHosts)) throw invalid('return_to is not an allowed Graylum URL')
  return value
}

export async function handleLink(request: Request, deps: PartnerRouteDeps): Promise<NextResponse> {
  try {
    assertPartnerKey(request.headers.get('authorization'), deps.env)
    const body = linkRequestSchema.safeParse(await request.json().catch(() => null))
    if (!body.success) throw invalid('code is required')
    const userId = await exchangeLinkCode(deps.db, body.data.code, deps.now?.())
    const [displayName, profile] = await Promise.all([partnerDisplayName(deps.db, userId), partnerProfile(deps.db, userId)])
    const response: LinkResponse = {
      account_id: userId,
      display_name: displayName,
      credits_remaining: profile.credits,
      free_credits_remaining: profile.freeCredits,
    }
    return partnerJson(response)
  } catch (error) {
    return partnerErrorResponse(error, { route: 'partner-link' })
  }
}

export async function handleAccount(request: Request, deps: PartnerRouteDeps): Promise<NextResponse> {
  try {
    const userId = await authenticatePartner(request, deps)
    const query = accountQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!query.success) throw invalid('return_to must be a URL')
    const returnTo = checkedReturnTo(query.data.return_to, deps.config)
    const profile = await partnerProfile(deps.db, userId)
    const response: AccountResponse = {
      credits_remaining: profile.credits,
      free_credits_remaining: profile.freeCredits,
      paid_until: profile.paidUntil,
      top_up_url: topUpUrl(deps.origin, returnTo),
    }
    return partnerJson(response)
  } catch (error) {
    return partnerErrorResponse(error, { route: 'partner-account' })
  }
}

// Key only, no account: the catalogue is the same for everyone, so Graylum may cache it.
// ?locale=zh (optional, T87) picks the covers that language's pages show (ARCHITECTURE §8.3);
// absent or unknown means English, as before. Names and fields stay the English contract.
export async function handleTemplates(request: Request, deps: PartnerRouteDeps): Promise<NextResponse> {
  try {
    assertPartnerKey(request.headers.get('authorization'), deps.env)
    const asked = new URL(request.url).searchParams.get('locale')
    const locale = isLocale(asked) ? asked : DEFAULT_LOCALE
    const templates = await listTemplates(deps.db, 'partner')
    const response: TemplatesResponse = { templates: templates.map((template) => toPartnerTemplate(withLocaleCover(template, locale))) }
    return partnerJson(response)
  } catch (error) {
    return partnerErrorResponse(error, { route: 'partner-templates' })
  }
}

// Read-only status for Graylum's timeout fallback; another account's job is a plain 404.
export async function handleJob(request: Request, deps: PartnerRouteDeps, jobId: string): Promise<NextResponse> {
  try {
    const userId = await authenticatePartner(request, deps)
    const job = await findOwnJob(deps.db, userId, jobId)
    if (!job) throw new PartnerError('not_found', 'Job not found')
    return partnerJson(toJobResponse(job, await partnerImageUrl(deps.store, job)))
  } catch (error) {
    return partnerErrorResponse(error, { route: 'partner-job' })
  }
}
