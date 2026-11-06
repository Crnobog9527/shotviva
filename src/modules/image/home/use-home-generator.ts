'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { useRouter } from '@/core/i18n'
import type { OutputAspect } from '@/core/templates/output-options'

import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import { enqueueJobs, setWorkspaceJobs } from '../generation/job-store'
import { useJobs } from '../generation/use-jobs'
import { startInputs } from '../workspace/batch-request'
import { homeCta, type HomeViewer } from './home-cta'
import { clearDraft, loadDraft, saveDraft } from './home-draft'
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

type Restore = { signedIn: boolean; known: (id: string) => boolean; apply(templateId: string | null, aspect: OutputAspect, note: string): void; pick(file: File): void }

// Brings back what a signed-out visitor set up before sign-up, once. Signed in, the photo now
// uploads and the draft is spent.
function useRestoreDraft({ signedIn, known, apply, pick }: Restore) {
  const done = useRef(false)
  useEffect(() => {
    if (done.current) return
    done.current = true
    void loadDraft().then((found) => {
      if (!found) return
      apply(known(found.draft.templateId) ? found.draft.templateId : null, found.draft.aspect, found.draft.note)
      if (found.photo) pick(found.photo)
      if (signedIn) void clearDraft()
    })
  }, [signedIn, known, apply, pick])
}

// Starts the photo exactly as the workspace does (DESIGN §6.9 item 9): one job in the
// generation store (reserve → generate on /api/generate), shown by that template's workspace,
// which is where the visitor lands, on the same job id.
function useStart(viewer: HomeViewer | null, template: CatalogueTemplate | null, photo: HomePhoto) {
  const router = useRouter()
  return useCallback(
    (aspect: OutputAspect, note: string) => {
      if (!viewer || !template || !photo.inputKey || !photo.url) return
      const upload = { phase: 'done' as const, inputKey: photo.inputKey }
      const ready = [{ photo: { id: 'home', url: photo.url, bytes: photo.file?.size ?? 0, ratio: null, upload }, inputKey: photo.inputKey }]
      const ids = enqueueJobs(startInputs(template, { aspect, resolution: '1k', note, copy: {} }, ready), viewer.concurrency.limit)
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
  const photo = useHomePhoto(viewer !== null)
  const known = useCallback((id: string) => templates.some((candidate) => candidate.id === id), [templates])
  const apply = useCallback((id: string | null, nextAspect: OutputAspect, nextNote: string) => {
    if (id) setTemplateId(id)
    setAspect(nextAspect)
    setNote(nextNote)
  }, [])
  useRestoreDraft({ signedIn: viewer !== null, known, apply, pick: photo.pick })
  const running = useRunning(viewer?.concurrency.runningIds ?? [])
  const cta = homeCta({
    viewer,
    cost: template ? template.creditsCost['1k'] : null,
    photo: photo.status,
    running,
    needsCopy: template?.copyFields.some((field) => field.required) ?? false,
  })
  const start = useStart(viewer, template, photo)
  return {
    template,
    templates,
    choose: setTemplateId,
    aspect,
    setAspect,
    note,
    setNote,
    photo,
    cta,
    generate: () => start(aspect, note.trim()),
    // Before the sign-up prompt: what to bring back afterwards.
    keepDraft: () => (template ? saveDraft({ templateId: template.id, aspect, note }, photo.file) : Promise.resolve()),
  }
}

export type HomeGeneratorState = ReturnType<typeof useHomeGenerator>
