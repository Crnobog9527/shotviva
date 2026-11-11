import 'server-only'

import { randomUUID } from 'node:crypto'

import type { ServerTrack } from '../analytics'
import { assertBatchAllowed } from './batch/limits'
import { assertBatchProof, batchInputs } from './batch/proof'
import { AppError } from '../errors'
import { screenIdentityText, type IdentityJudge } from '../identity-guard'
import { isOwnInputKey, loadInputImage, outputKeyFor, writeInputPreview } from '../storage'
import {
  DEFAULT_RESOLUTION,
  loadGenerationTemplate,
  allowedWebAspects,
  assertPricedTier,
  assertTemplateQuote,
  publicCopyKeys,
  validateGenerationInputs,
  type GenerationInputs,
  type Resolution,
  type TemplateSurface,
  type Template,
} from '../templates'
import { routeFallbackReason, withFallbackNotice } from './fallback-notice'
import { settleTracked } from './generation-analytics'
import { screenCost, templateCall, typedWords } from './generation-call'
import type { GenerationRequest } from './generation-request'
import { findOwnJob } from './job-lookup'
import type { Job, JobSource } from './job-schema'
import { toJobView, type JobView } from './job-view'
import { currentTier, limitsFor } from '../billing/tier'
import { assertWithinRateLimit } from './rate-limit'
import { settleGeneration, type SettleDeps } from './settle-generation'
import { recordJobClientIp } from './job-download'
import type { TemplateProvider } from './provider'
import { reserveJob } from './settlement'

// `track` is injectable so tests can assert the `generate` event without PostHog.
// `identityJudge`: the text-only decision call of ARCHITECTURE §5.1a; null or absent means the
// user's words go through unscreened (fail open).
export type GenerationDeps = Omit<SettleDeps, 'provider'> & {
  provider: TemplateProvider
  now?: () => Date
  track?: ServerTrack
  identityJudge?: IdentityJudge | null
  identityJudgeTimeoutMs?: number
}

const SURFACE: Record<JobSource, TemplateSurface> = { web: 'web', graylum: 'partner' }


function requestAspects(req: GenerationRequest, template: Template) {
  return req.source === 'web' ? allowedWebAspects(template.imageOptions, req.resolution ?? DEFAULT_RESOLUTION) : undefined
}

// Everything that can be rejected without touching credits: template, fields, key
// ownership, tier limits (batch size, rate limit), then the user's words (ARCHITECTURE §5.1a:
// no face swap) alongside the stored upload itself (HEAD + bytes; bad ones are deleted).
async function prepare(deps: GenerationDeps, req: GenerationRequest) {
  const membership = await currentTier(deps.db, req.userId)
  assertBatchAllowed(membership, req.batchSize, req.batchTemplates)
  assertBatchProof(req)
  const { template, prompt } = await loadGenerationTemplate(deps.db, req.templateId, SURFACE[req.source])
  const tier = req.resolution ?? DEFAULT_RESOLUTION
  assertPricedTier(template.unpricedResolutions, tier)
  assertTemplateQuote(req.expectedCredits, template.creditsCost[tier])
  const inputs = validateGenerationInputs(template.fields, {
    copy: req.copy,
    aspectRatio: req.aspectRatio,
    note: req.note,
    // Partner v1 takes no toggles: every one stays at its default, off (T89).
    ...(req.source === 'web' ? { toggles: req.toggles, togglesConfirmed: req.togglesConfirmed } : {}),
    imageCount: req.inputKey ? 1 : 0,
    aspects: requestAspects(req, template),
  })
  // Never touch (or delete) an object outside the caller's own inputs/ prefix.
  if (req.inputKey && !isOwnInputKey(req.userId, req.inputKey)) throw new AppError('INVALID_INPUT', 'Unknown upload')
  await assertWithinRateLimit(deps.db, req.userId, deps.now?.() ?? new Date(), limitsFor(membership), {
    jobId: req.jobId,
    idempotencyKey: req.idempotencyKey,
  })
  // In parallel: the decision call usually finishes while the upload is still being read.
  const [screen, image] = await Promise.all([screenWords(deps, req, inputs), req.inputKey ? loadInputImage(deps.store, req.inputKey) : null])
  return { template, prompt, inputs, image, screen }
}

// Every word the user typed that reaches the image model: the template's text fields and the
// note (the partner's freeform prompt is its `prompt` text field). Templates' own prompts never.
function screenWords(deps: GenerationDeps, req: GenerationRequest, inputs: GenerationInputs) {
  return screenIdentityText(deps, {
    userId: req.userId,
    entry: req.source === 'graylum' ? 'partner' : 'workspace',
    texts: typedWords(inputs),
    locale: req.locale,
  })
}

type Prepared = Awaited<ReturnType<typeof prepare>>

// The toggles the user chose (T89) and, for each confirmed one, the server's time: evidence that a
// customer complaint followed an option the user turned on themselves. Nothing for a template
// without toggles, so those jobs look as before.
export function toggleInputs(inputs: GenerationInputs, now: Date) {
  if (Object.keys(inputs.toggles).length === 0) return {}
  const at = now.toISOString()
  const confirmedAt = Object.fromEntries(inputs.confirmed.map((key) => [key, at]))
  return { toggles: inputs.toggles, ...(inputs.confirmed.length > 0 ? { toggles_confirmed_at: confirmedAt } : {}) }
}

// User content only; the wrapped prompt stays in template_prompts (ARCHITECTURE §4).
// reserve_credits charges templates.credits_cost[resolution] from this very object.
function jobInputs(req: GenerationRequest, { inputs, prompt, template }: Prepared, resolution: Resolution, attemptId: string, now: Date) {
  const shown = publicCopyKeys(template.fields.copy)
  return {
    copy: inputs.copy,
    // Which fields were public at this moment (§5.1d); none for most templates, so their jobs look as before.
    ...(shown.length > 0 ? { copy_public: shown } : {}),
    aspect_ratio: inputs.aspectRatio,
    resolution,
    ...(inputs.note ? { note: inputs.note } : {}),
    ...toggleInputs(inputs, now),
    input_key: req.inputKey ?? null,
    prompt_version: prompt.version,
    attempt_id: attemptId,
    ...batchInputs(req),
  }
}

// What reserve_credits takes straight from the request.
function reserveFields(req: GenerationRequest) {
  return {
    userId: req.userId,
    source: req.source,
    idempotencyKey: req.idempotencyKey ?? null,
    visibility: req.visibility ?? null,
  }
}

// ARCHITECTURE §8 「原图小图」 (T32), only once the result is confirmed: a failed job has no photo
// page. Edits (T30) settle elsewhere and get none; their source is the work they edited. (The
// upload itself is copied next to the result during settle, T40.)
async function keepInputPreview(deps: GenerationDeps, job: Job, image: Prepared['image']) {
  if (image) await writeInputPreview(deps.store, { userId: job.userId, jobId: job.id, bytes: image.bytes })
}

// Synchronous generation (ARCHITECTURE §4) shared by the web route and, later, the partner
// route. Returns the settled job; failures after reservation throw GenerationFailure with
// the credits already refunded. The response never carries image bytes.
function expectedPrice(req: GenerationRequest, template: Template, resolution: Resolution) {
  return req.expectedCredits ?? (req.source === 'graylum' ? template.creditsCost[resolution] : null)
}

export async function runGeneration(deps: GenerationDeps, req: GenerationRequest): Promise<JobView> {
  if (req.jobId) {
    const existing = await findOwnJob(deps.db, req.userId, req.jobId)
    if (existing) return toJobView(existing)
  }
  const prepared = await prepare(deps, req)
  const { template, prompt, inputs, image } = prepared

  const jobId = req.jobId ?? randomUUID()
  const resolution = req.resolution ?? DEFAULT_RESOLUTION
  const attemptId = randomUUID()
  const { job, call, provider } = await withFallbackNotice(template.id, async (selected) => {
    const route = await templateCall(deps, { template, prompt }, inputs, image, {
      resolution, providerId: req.source === 'web' ? prompt.providerId : null,
      onRoute: actual => selected(routeFallbackReason(actual, prompt.providerId, req.source)),
    })
    const reason = routeFallbackReason(route.provider, prompt.providerId, req.source)
    const job = await reserveJob(deps.db, {
      ...reserveFields(req), jobId, module: template.module, templateId: template.id, provider: route.provider.id,
      expectedCredits: expectedPrice(req, template, resolution),
      inputs: { ...jobInputs(req, prepared, resolution, attemptId, deps.now?.() ?? new Date()),
        quality: route.call.quality, style_ref_keys: route.styleRefKeys, ...(reason ? { fallback_route: true } : {}) },
    })
    return { job, ...route }
  })
  if (job.inputs.attempt_id !== attemptId) return toJobView(job)
  // Dispute evidence (T82): the IP that started this paid or free work.
  await recordJobClientIp(deps.db, { userId: req.userId, jobId: job.id, ip: req.clientIp })

  const settle = () =>
    settleGeneration({ ...deps, provider }, job, call, outputKeyFor(req.userId, job.id), {
      inputKeys: req.inputKey ? [req.inputKey] : [],
      decision: screenCost(deps.identityJudge, prepared.screen),
    })
  const settled = await settleTracked(job, template.category, settle, {
    track: deps.track,
    batchSize: req.batchSize ?? 1,
    locale: req.locale,
  })
  await keepInputPreview(deps, settled, image)
  return toJobView(settled)
}
