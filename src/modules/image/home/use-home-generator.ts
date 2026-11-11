'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { useRouter } from '@/core/i18n'
import type { OutputAspect } from '@/core/templates/output-options'

import { allowsNoPhoto, type CatalogueTemplate } from '../catalogue/catalogue-template'
import { enqueueJobs, setWorkspaceJobs } from '../generation/job-store'
import { useJobs } from '../generation/use-jobs'
import { chosenAspect, closestResolution, hasOutputOptions, selectedAspect, templateOptions } from '../workspace/output-choice'
import { useOriginalRatio } from '../workspace/use-original-ratio'
import { startInputs } from '../workspace/batch-request'
import { homeCta, type HomeCta, type HomeViewer } from './home-cta'
import { clearDraft, loadDraft, saveDraft, type HomeDraft } from './home-draft'
import { useHomePhoto, type HomePhoto } from './use-home-photo'

type Args = { templates: readonly CatalogueTemplate[]; defaultId: string | null; viewer: HomeViewer | null }

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

type Restore = { signedIn: boolean; apply(draft: HomeDraft): boolean; pick(file: File): void }

// Brings back what a signed-out visitor set up before sign-up, once. Signed in, the photo now
// uploads and the draft is spent.
function useRestoreDraft({ signedIn, apply, pick }: Restore) {
  const done = useRef(false)
  useEffect(() => {
    if (done.current) return
    done.current = true
    void loadDraft().then((found) => {
      if (!found) return
      const acceptsPhoto = apply(found.draft)
      if (acceptsPhoto && found.photo) pick(found.photo)
      if (signedIn) void clearDraft()
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
  // Signed in with the photo in: fetch the template's workspace route now, so Generate's jump to
  // the developing view is a client move, not a cold route load (perf window 2026-11-12: the
  // 0.9–1.4 s pause after Generate was the route transition).
  const ready = viewer !== null && template !== null && photo.status === 'ready'
  const templateId = template?.id
  useEffect(() => {
    if (ready && templateId) router.prefetch(`/generate/${templateId}`)
  }, [ready, templateId, router])
  return useCallback(
    (aspect: OutputAspect | null, note: string) => {
      if (!viewer || !template || !aspect) return
      const ready = readyHomePhoto(photo)
      if (!ready.length && !(allowsNoPhoto(template) && photo.status === 'none')) return
      // No template toggles here: they are only offered once the template itself is open (its
      // create page or dialog), so a photo started from the home bar has them all off (Owner 2026-11-12).
      const ids = enqueueJobs(startInputs(template, { aspect, resolution: '1k', note, copy: {}, toggles: {} }, ready), viewer.concurrency.limit)
      setWorkspaceJobs(template.id, ids)
      router.push(`/generate/${template.id}`)
    },
    [viewer, template, photo, router],
  )
}

export function useHomeGenerator({ templates, defaultId, viewer }: Args) {
  const [templateId, setTemplateId] = useState(defaultId)
  const template = templates.find((candidate) => candidate.id === templateId) ?? templates[0] ?? null
  const [aspect, setAspect] = useState<OutputAspect>('original')
  const [note, setNote] = useState('')
  const pickedPhoto = useHomePhoto(viewer !== null)
  const photo: HomePhoto = template?.photoInput === 'none'
    ? { ...pickedPhoto, url: null, inputKey: null, file: null, error: null, status: 'none' } : pickedPhoto
  const apply = useCallback(
    (draft: HomeDraft) => {
      const saved = templates.find((candidate) => candidate.id === draft.templateId)
      if (saved) setTemplateId(saved.id)
      setAspect(draft.aspect)
      setNote(draft.note)
      return saved !== undefined && saved.photoInput !== 'none'
    },
    [templates],
  )
  useRestoreDraft({ signedIn: viewer !== null, apply, pick: photo.pick })
  const running = useRunning(viewer?.concurrency.runningIds ?? [])
  const { options, photoRatio, outputAspect, cost } = useHomeOutput(template, aspect, photo)
  const cta = generatorCta(template, viewer, photo, running, cost, outputAspect)
  const start = useStart(viewer, template, photo)
  return {
    template,
    templates,
    choose: setTemplateId,
    options, photoRatio, cost,
    aspect: selectedAspect(aspect, options),
    setAspect,
    note,
    setNote,
    photo,
    cta,
    generate: () => start(outputAspect, note.trim()),
    // Before the sign-up prompt: what to bring back afterwards.
    keepDraft: () => (template ? saveDraft({ templateId: template.id, aspect, note }, photo.file) : Promise.resolve()),
  }
}

function useHomeOutput(template: CatalogueTemplate | null, aspect: OutputAspect, photo: HomePhoto) {
  const options = templateOptions(template)
  const measured = useOriginalRatio(!options.originalRatio ? photo.url : null)
  const photoRatio = photo.status === 'none' && allowsNoPhoto(template) ? 1 : measured
  const outputAspect = chosenAspect(aspect, options, photoRatio)
  const resolution = closestResolution('1k', options)
  const cost = template && resolution && hasOutputOptions(options) ? template.creditsCost[resolution] : null
  return { options, photoRatio, outputAspect, cost }
}

function generatorCta(template: CatalogueTemplate | null, viewer: HomeViewer | null, photo: HomePhoto, running: number, cost: number | null, outputAspect: OutputAspect | null): HomeCta {
  if (template && cost === null) return { kind: 'no-options' }
  if (photo.status === 'ready' && !outputAspect) return { kind: 'need-size' }
  return homeCta({ viewer, cost, photo: photo.status, photoOptional: allowsNoPhoto(template), running, needsCopy: template?.copyFields.some((field) => field.required) ?? false })
}

export type HomeGeneratorState = ReturnType<typeof useHomeGenerator>
