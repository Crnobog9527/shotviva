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
  hasSlots,
  publicCopyKeys,
  toStoredSlots,
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
import { effectiveTier, limitsFor } from '../billing/tier'
import { assertWithinRateLimit } from './rate-limit'
import { settleGeneration, type SettleDeps } from './settle-generation'
import { backgroundInput } from './job-background'
import { recordJobClientIp } from './job-download'
import type { TemplateProvider } from './provider'
import { reserveJob } from './settlement'
import { callRpc } from '../billing/rpc'
import { logger } from '../logger'
import { z } from 'zod'
import { posterPart, redrawSlots } from './poster-generation'

// `track` is injectable so tests can assert the `generate` event without PostHog.
// `identityJudge`: the text-only decision call of ARCHITECTURE §5.1a; null or absent means the
// user's words go through unscreened (fail open).
export type GenerationDeps = Omit<SettleDeps, 'provider'> & {
  provider: TemplateProvider
  now?: () => Date
  track?: ServerTrack
  identityJudge?: IdentityJudge | null
  identityJudgeTimeoutMs?: number
  // The invite-only gate of poster templates (ARCHITECTURE §5.3); tests pass their own reads.
  allowPoster?: (userId: string) => Promise<void>
  // A finished poster's text check (§5.3 自动核对), scheduled after the response by the route.
  afterPoster?: (job: Job) => void
}

const SURFACE: Record<JobSource, TemplateSurface> = { web: 'web', graylum: 'partner' }


// A slot template offers no "as shot" size: its images are a logo and the like, not a photo to
// follow (§5.1e).
export function requestAspects(req: Pick<GenerationRequest, 'source' | 'resolution'>, template: Pick<Template, 'imageOptions' | 'fields'>) {
  if (req.source !== 'web') return undefined
  const aspects = allowedWebAspects(template.imageOptions, req.resolution ?? DEFAULT_RESOLUTION)
  return hasSlots(template.fields) ? aspects.filter((aspect) => aspect !== 'original') : aspects
}

// A slot template is one job at a time (总控 2026-11-12): its images each have their own role,
// so there is no "same settings × several photos" to batch.
function assertSingleRun(req: GenerationRequest, template: Template) {
  if (!hasSlots(template.fields)) return
  // Web only (§14.6): the save refuses a partner-visible slot template; this is the backstop.
  if (req.source !== 'web') throw new AppError('TEMPLATE_UNAVAILABLE', 'Template not available')
  if (req.batchId || req.batchCell || (req.batchSize ?? 1) > 1 || (req.batchTemplates ?? 1) > 1) {
    throw new AppError('INVALID_INPUT', 'This template makes one image at a time')
  }
}

// The job's uploads in the order the model gets them: the one photo, or the filled slots.
const uploadKeys = (req: GenerationRequest, inputs: GenerationInputs): string[] =>
  inputs.slots ? inputs.slots.map((slot) => slot.upload) : req.inputKey ? [req.inputKey] : []

// The first redraw of a poster whose text check failed is free (Owner 2026-11-13): once it has
// succeeded, grant_poster_free_redraw (1347) gives back what it reserved, at most once per poster.
// A failed grant only means the redraw stays paid; it never fails the finished work.
async function grantFreeRedraw(deps: GenerationDeps, job: Job): Promise<void> {
  try {
    await callRpc(deps.db, 'grant_poster_free_redraw', { p_job_id: job.id }, z.boolean())
  } catch (error) {
    logger.error('poster.free_redraw.failed', { jobId: job.id, error })
  }
}

// After a poster job succeeds: a free redraw's refund (on this request, so the balance the user
// sees next is right), then its text check, scheduled after the response.
async function finishPoster(deps: GenerationDeps, poster: Prepared['poster'], job: Job) {
  if (!poster || job.status !== 'succeeded') return
  if (poster.redraw_of) await grantFreeRedraw(deps, job)
  deps.afterPoster?.(job)
}

// Everything that can be rejected without touching credits: template, fields, key
// ownership, tier limits (batch size, rate limit), then the user's words (ARCHITECTURE §5.1a:
// no face swap) alongside the stored upload itself (HEAD + bytes; bad ones are deleted).
async function prepare(deps: GenerationDeps, req: GenerationRequest) {
  const membership = await effectiveTier(deps.db, req.userId)
  assertBatchAllowed(membership, req.batchSize, req.batchTemplates)
  assertBatchProof(req)
  const { template, prompt } = await loadGenerationTemplate(deps.db, req.templateId, SURFACE[req.source])
  const tier = req.resolution ?? DEFAULT_RESOLUTION
  assertPricedTier(template.unpricedResolutions, tier)
  assertTemplateQuote(req.expectedCredits, template.creditsCost[tier])
  assertSingleRun(req, template)
  // A poster redraw brings back the source poster's kept prize photo (ARCHITECTURE §5.3).
  const inputSlots = req.inputSlots ?? (await redrawSlots(deps, req, template))
  const validated = validateGenerationInputs(template.fields, {
    copy: req.copy,
    aspectRatio: req.aspectRatio,
    note: req.note,
    // Partner v1 takes no toggles: every one stays at its default, off (T89).
    ...(req.source === 'web' ? { toggles: req.toggles, togglesConfirmed: req.togglesConfirmed } : {}),
    imageCount: req.inputKey ? 1 : 0,
    ...(inputSlots ? { slots: inputSlots } : {}),
    aspects: requestAspects(req, template),
  })
  const { inputs, poster } = withPoster(validated, await posterPart(deps, req, template, validated))
  const keys = uploadKeys(req, inputs)
  // Never touch (or delete) an object outside the caller's own inputs/ prefix.
  if (keys.some((key) => !isOwnInputKey(req.userId, key))) throw new AppError('INVALID_INPUT', 'Unknown upload')
  await assertWithinRateLimit(deps.db, req.userId, deps.now?.() ?? new Date(), limitsFor(membership), {
    jobId: req.jobId,
    idempotencyKey: req.idempotencyKey,
  })
  // In parallel: the decision call usually finishes while the upload is still being read.
  const [screen, images] = await Promise.all([screenWords(deps, req, inputs), Promise.all(keys.map((key) => loadInputImage(deps.store, key)))])
  return { template, prompt, inputs, images, keys, screen, poster }
}

function withPoster(inputs: GenerationInputs, poster: Awaited<ReturnType<typeof posterPart>>) {
  return poster ? { inputs: { ...inputs, posterText: poster.text }, poster: poster.record } : { inputs, poster: null }
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
function jobInputs(req: GenerationRequest, prepared: Prepared, resolution: Resolution, attemptId: string, now: Date) {
  const { inputs, prompt, template } = prepared
  const shown = publicCopyKeys(template.fields.copy)
  return {
    copy: inputs.copy,
    // Which fields were public at this moment (§5.1d); none for most templates, so their jobs look as before.
    ...(shown.length > 0 ? { copy_public: shown } : {}),
    aspect_ratio: inputs.aspectRatio,
    resolution,
    ...(inputs.note ? { note: inputs.note } : {}),
    ...toggleInputs(inputs, now),
    input_key: inputs.slots ? null : req.inputKey ?? null,
    // [{ key, upload }] in send order (an array: jsonb would re-sort object keys); Make again puts
    // kept copy n back in the n-th slot (§5.1e).
    ...(inputs.slots ? { input_slots: toStoredSlots(inputs.slots) } : {}),
    prompt_version: prompt.version,
    attempt_id: attemptId,
    ...batchInputs(req),
    ...(prepared.poster ? { poster: prepared.poster } : {}),
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
// page. Edits (T30) settle elsewhere and get none; their source is the work they edited. A slot
// template's work has none either: a logo and prize photos are no "before" (§5.1e). (The
// uploads themselves are copied next to the result during settle, T40.)
async function keepInputPreview(deps: GenerationDeps, job: Job, { images, inputs }: Pick<Prepared, 'images' | 'inputs'>) {
  const [image] = images
  if (image && !inputs.slots) await writeInputPreview(deps.store, { userId: job.userId, jobId: job.id, bytes: image.bytes })
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
  const { template, prompt, inputs, images } = prepared

  const jobId = req.jobId ?? randomUUID()
  const resolution = req.resolution ?? DEFAULT_RESOLUTION
  const attemptId = randomUUID()
  const { job, call, provider } = await withFallbackNotice(template.id, async (selected) => {
    const route = await templateCall(deps, { template, prompt }, inputs, images, {
      resolution, providerId: req.source === 'web' ? prompt.providerId : null,
      onRoute: actual => selected(routeFallbackReason(actual, prompt.providerId, req.source)),
    })
    const reason = routeFallbackReason(route.provider, prompt.providerId, req.source)
    const job = await reserveJob(deps.db, {
      ...reserveFields(req), jobId, module: template.module, templateId: template.id, provider: route.provider.id,
      expectedCredits: expectedPrice(req, template, resolution),
      inputs: { ...jobInputs(req, prepared, resolution, attemptId, deps.now?.() ?? new Date()),
        quality: route.call.quality, ...backgroundInput(route.call.params, route.provider), style_ref_keys: route.styleRefKeys, ...(reason ? { fallback_route: true } : {}) },
    })
    return { job, ...route }
  })
  if (job.inputs.attempt_id !== attemptId) return toJobView(job)
  // Dispute evidence (T82): the IP that started this paid or free work.
  await recordJobClientIp(deps.db, { userId: req.userId, jobId: job.id, ip: req.clientIp })

  const settle = () =>
    settleGeneration({ ...deps, provider }, job, call, outputKeyFor(req.userId, job.id), {
      inputKeys: prepared.keys,
      decision: screenCost(deps.identityJudge, prepared.screen),
    })
  const settled = await settleTracked(job, template.category, settle, {
    track: deps.track,
    batchSize: req.batchSize ?? 1,
    locale: req.locale,
  })
  await keepInputPreview(deps, settled, prepared)
  await finishPoster(deps, prepared.poster, settled)
  return toJobView(settled)
}
