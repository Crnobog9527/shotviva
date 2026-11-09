'use client'

import { useEffect, useState } from 'react'

import type { Balance } from '@/core/billing/pools'
import { limitsFor } from '@/core/billing/tier-limits'
import type { MembershipTier } from '@/core/config'

import type { AgainStart } from '../again/again-start'
import { allowsNoPhoto, type CatalogueTemplate } from '../catalogue/catalogue-template'
import { enqueueJobs, setWorkspaceJobs } from '../generation/job-store'
import { useJobs } from '../generation/use-jobs'
import { startInputs } from './batch-request'
import { chosenAspect, closestResolution, hasOutputOptions, selectedAspect, templateOptions } from './output-choice'
import { ctaState, type CtaState } from './cta-state'
import { missingRequiredCopy } from './text-fields'
import { usePhotoBatch, type PhotoBatch } from './use-photo-batch'
import type { FormValues } from './workspace-form'

export type DraftInput = {
  template: CatalogueTemplate
  balance: Balance
  // current_tier() from the server: decides batchMax (TIER_LIMITS); null is Starter.
  tier: MembershipTier | null
  // From the server: the account's concurrency (TIER_LIMITS) and the jobs running at render
  // time, so photos started in another tab count too.
  concurrency: { limit: number; runningIds: string[] }
  // Make again from a finished work (T40, workspace page only): its settings, and its photos
  // when they were kept with it.
  again?: AgainStart | null
  // The creation dialog takes one photo; a batch is added on the workspace page (DESIGN §6.9
  // item 2).
  single?: boolean
}

const DEFAULTS: FormValues = { aspect: 'original', resolution: '1k', note: '', copy: {}, toggles: {} }

// The creation form's state, one source for its two frames (T38, DESIGN §6.9 item 2): the
// dialog Create opens and the workspace page. Photos upload as they are picked; start() queues
// one job per ready photo in the generation store and makes them this template's workspace
// jobs, so the workspace page shows them developing (and after a refresh).
export function useWorkspaceDraft({ template, balance, tier, concurrency, again = null, single = false }: DraftInput) {
  const batchMax = single ? 1 : limitsFor(tier).batchMax
  const photos = usePhotoBatch(template.photoInput === 'none' ? 0 : batchMax, again ? { photos: again.photos, madeAt: again.madeAt } : undefined)
  const { options, values, change } = useOutputValues(template, again)
  useAgainOpensForm(template.id, again?.jobId)
  const running = useRunningCount(concurrency.runningIds)
  const { summary } = photos
  const needsRatio = summary.ready.some(({ photo }) => !chosenAspect(values.aspect, options, photo.originalRatio))
  const state: CtaState = !hasOutputOptions(options) ? { kind: 'no-options' } : needsRatio ? { kind: 'need-size' } : ctaState({
    balance,
    cost: template.creditsCost[values.resolution],
    running,
    limit: concurrency.limit,
    photo: draftPhotoStatus(template, photos, again),
    count: summary.planned,
    copyMissing: missingRequiredCopy(template.copyFields, values.copy),
  })
  const start = () => {
    if (state.kind !== 'generate') return
    setWorkspaceJobs(template.id, enqueueJobs(startInputs(template, values, summary.ready), concurrency.limit))
    // A reload now comes back to these jobs, not to Make again's form (and copies nothing again).
    if (again) window.history.replaceState(null, '', window.location.pathname)
  }
  return { photos, values, change, state, start, missingPhoto: again?.missing != null }
}

function useOutputValues(template: CatalogueTemplate, again: AgainStart | null) {
  const [requested, setValues] = useState(again?.values ?? DEFAULTS)
  const options = templateOptions(template)
  const values = {
    ...requested,
    resolution: closestResolution(requested.resolution, options) ?? requested.resolution,
    aspect: selectedAspect(requested.aspect, options),
  }
  const change = (next: Partial<FormValues>) => setValues((current) => ({ ...current, ...next }))
  return { options, values, change }
}

function draftPhotoStatus(template: CatalogueTemplate, photos: PhotoBatch, again: AgainStart | null) {
  if (allowsNoPhoto(template) && photos.photos.length === 0 && !again?.missing) return 'ready'
  return photos.summary.photo
}

export type WorkspaceDraft = ReturnType<typeof useWorkspaceDraft>

// Make again opens on the form even when this workspace was last showing a result or a batch.
function useAgainOpensForm(templateId: string, jobId: string | undefined) {
  useEffect(() => {
    if (jobId) setWorkspaceJobs(templateId, [])
  }, [templateId, jobId])
}

// Running photos for the concurrency check: the server's list at render plus this tab's own.
// A job this tab saw settle may still be in the server's (older) list, so it is taken out.
function useRunningCount(serverIds: string[]): number {
  const ids = new Set(serverIds)
  for (const job of useJobs()) {
    if (job.status === 'running') ids.add(job.id)
    else ids.delete(job.id)
  }
  return ids.size
}
