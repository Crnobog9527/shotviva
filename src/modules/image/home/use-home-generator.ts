'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { defaultTier, type Balance } from '@/core/billing/pools'
import { useRouter } from '@/core/i18n'
import type { OutputAspect, Resolution } from '@/core/templates/output-options'

import { allowsNoPhoto, type CatalogueTemplate } from '../catalogue/catalogue-template'
import { enqueueJobs, setWorkspaceJobs } from '../generation/job-store'
import { useJobs } from '../generation/use-jobs'
import { rememberTemplate } from '../workspace/pending-template'
import { useWarmRoute } from '../workspace/use-warm-route'
import { chosenAspect, closestResolution, hasOutputOptions, selectedAspect, templateOptions } from '../workspace/output-choice'
import { useOriginalRatio } from '../workspace/use-original-ratio'
import { startInputs } from '../workspace/batch-request'
import { homeCta, type HomeCta, type HomeViewer } from './home-cta'
import { clearDraft, loadDraft, type HomeDraft } from './home-draft'
import { useHomePhoto, type HomePhoto } from './use-home-photo'

type Args = {
  templates: readonly CatalogueTemplate[]
  defaultId: string | null
  viewer: HomeViewer | null
  find(id: string): Promise<CatalogueTemplate | null>
}

// Running photos for the concurrency check: the server's list at render plus this tab's own
// (the workspace counts the same way).
function useRunning(serverIds: readonly string[]): number {
  const ids = new Set(serverIds)
  for (const job of useJobs()) {
    if (job.status === 'running') ids.add(job.id)
    else ids.delete(job.id)
  }
  return ids.size
}

type Restore = { signedIn: boolean; apply(draft: HomeDraft): Promise<boolean>; pick(file: File): void }

// Brings back what a signed-out visitor set up before sign-up, once. Signed in, the photo now
// uploads and the draft is spent.
function useRestoreDraft({ signedIn, apply, pick }: Restore) {
  const done = useRef(false)
  useEffect(() => {
    if (done.current) return
    done.current = true
    void loadDraft().then(async (found) => {
      if (!found) return
      const acceptsPhoto = await apply(found.draft)
      if (acceptsPhoto && found.photo) pick(found.photo)
      if (signedIn) void clearDraft()
    }).catch(() => {
      // A catalogue outage leaves the draft in this browser for the next visit.
    })
  }, [signedIn, apply, pick])
}

// Starts the photo exactly as the workspace does (DESIGN §6.9 item 9): one job in the
// generation store (reserve → generate on /api/generate), shown by that template's workspace,
// which is where the visitor lands, on the same job id.
function readyHomePhoto(photo: HomePhoto) {
  if (!photo.inputKey || !photo.url || photo.status !== 'ready') return []
  const upload = { phase: 'done' as const, inputKey: photo.inputKey }
  return [{ photo: { id: 'home', url: photo.url, bytes: photo.file?.size ?? 0, ratio: null, upload }, inputKey: photo.inputKey }]
}

function useStart(viewer: HomeViewer | null, template: CatalogueTemplate | null, photo: HomePhoto) {
  const router = useRouter()
  // Signed in with a template chosen: keep that template's workspace route warm, as the creation
  // dialogs do, so Generate's jump to the developing view is a client move on the click (#515).
  // Not only once the photo is in: a visitor who presses Generate the moment the upload ends
  // found it still cold (1.35 s from the click to the move on the test site, 2026-11-12).
  // Switching templates moves the warm-up to the new one; signed out nothing is fetched, and
  // useWarmRoute asks nothing while the tab is in the background.
  useWarmRoute(`/generate/${template?.id ?? ''}`, viewer !== null && template !== null)
  return useCallback(
    (aspect: OutputAspect | null, resolution: Resolution | null, note: string) => {
      if (!viewer || !template || !aspect || !resolution) return
      const ready = readyHomePhoto(photo)
      if (!ready.length && !(allowsNoPhoto(template) && photo.status === 'none')) return
      // No template toggles here: they are only offered once the template itself is open (its
      // create page or dialog), so a photo started from the home bar has them all off (Owner 2026-11-12).
      const ids = enqueueJobs(startInputs(template, { aspect, resolution, note, copy: {}, toggles: {} }, ready), viewer.concurrency.limit)
      setWorkspaceJobs(template.id, ids)
      // The workspace page's pending view draws this template's full head (thumbnail, name,
      // category and use) until the server's page takes over, as after a dialog's Generate.
      rememberTemplate(template)
      router.push(`/generate/${template.id}`)
    },
    [viewer, template, photo, router],
  )
}

function useSelectedTemplate({ templates, defaultId, find }: Omit<Args, 'viewer'>) {
  const [template, setTemplate] = useState(() => templates.find((candidate) => candidate.id === defaultId) ?? templates[0] ?? null)
  // `auto`: the template on show is the random opening (use-random-opening.ts), not the visitor's
  // choice; the card keeps the page's frame for it so nothing moves.
  const [auto, setAuto] = useState(false)
  const intent = useRef(0)
  const choose = useCallback(async (id: string) => {
    const current = ++intent.current
    const picked = await find(id).catch((error: unknown) => {
      if (current === intent.current) throw error
      return null
    })
    if (current !== intent.current || !picked) return null
    setTemplate(picked)
    setAuto(false)
    return picked
  }, [find])
  const show = useCallback((picked: CatalogueTemplate) => {
    if (intent.current !== 0) return
    setTemplate(picked)
    setAuto(true)
  }, [])
  return { template, choose, intent, auto, show }
}

export function useHomeGenerator({ templates, defaultId, viewer, find }: Args) {
  const { template, choose, intent, auto, show } = useSelectedTemplate({ templates, defaultId, find })
  const [aspect, setAspect] = useState<OutputAspect>('original')
  const [note, setNote] = useState('')
  const pickedPhoto = useHomePhoto(viewer !== null)
  const photo: HomePhoto = template?.photoInput === 'none'
    ? { ...pickedPhoto, url: null, inputKey: null, file: null, error: null, status: 'none' } : pickedPhoto
  const apply = useCallback(
    async (draft: HomeDraft) => {
      if (intent.current) return false
      setAspect(draft.aspect)
      setNote(draft.note)
      const saved = await choose(draft.templateId)
      return saved !== null && saved.photoInput !== 'none'
    },
    [choose, intent],
  )
  useRestoreDraft({ signedIn: viewer !== null, apply, pick: photo.pick })
  const running = useRunning(viewer?.concurrency.runningIds ?? [])
  const { options, photoRatio, outputAspect, resolution, cost } = useHomeOutput(template, aspect, photo, viewer?.balance ?? null)
  const cta = generatorCta(template, viewer, photo, running, { cost, resolution }, outputAspect)
  const start = useStart(viewer, template, photo)
  return {
    template,
    templates,
    choose,
    auto, show,
    // Nothing chosen or brought back yet (a restored draft chooses too): the random opening may
    // still take the card.
    untouched: () => intent.current === 0,
    options, photoRatio, cost,
    aspect: selectedAspect(aspect, options),
    setAspect,
    note,
    setNote,
    photo,
    cta,
    generate: () => start(outputAspect, resolution, note.trim()),
  }
}

// The tier the home bar makes (it has no picker): signed in, 2K when paid credits cover it, else
// 1K when free credits do (1996), else 2K so a shortfall opens the paywall; signed out, 1K (what
// the signup gift pays for).
function homeTier(template: CatalogueTemplate | null, options: ReturnType<typeof templateOptions>, balance: Balance | null) {
  const picked = balance && template ? defaultTier(balance, template.creditsCost, options.resolutions) : null
  return closestResolution(picked ?? (balance ? '2k' : '1k'), options)
}

function useHomeOutput(template: CatalogueTemplate | null, aspect: OutputAspect, photo: HomePhoto, balance: Balance | null) {
  const options = templateOptions(template)
  const measured = useOriginalRatio(!options.originalRatio ? photo.url : null)
  const photoRatio = photo.status === 'none' && allowsNoPhoto(template) ? 1 : measured
  const outputAspect = chosenAspect(aspect, options, photoRatio)
  const resolution = homeTier(template, options, balance)
  const cost = template && resolution && hasOutputOptions(options) ? template.creditsCost[resolution] : null
  return { options, photoRatio, outputAspect, resolution, cost }
}

function generatorCta(template: CatalogueTemplate | null, viewer: HomeViewer | null, photo: HomePhoto, running: number,
  { cost, resolution }: { cost: number | null; resolution: Resolution | null }, outputAspect: OutputAspect | null): HomeCta {
  if (template && cost === null) return { kind: 'no-options' }
  if (photo.status === 'ready' && !outputAspect) return { kind: 'need-size' }
  return homeCta({ viewer, cost, tier: resolution ?? '1k', photo: photo.status, photoOptional: allowsNoPhoto(template), running, needsCopy: template?.copyFields.some((field) => field.required) ?? false })
}

export type HomeGeneratorState = ReturnType<typeof useHomeGenerator>
