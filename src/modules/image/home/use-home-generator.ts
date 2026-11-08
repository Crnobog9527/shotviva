'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { useRouter } from '@/core/i18n'
import type { OutputAspect } from '@/core/templates/output-options'

import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import { enqueueJobs, setWorkspaceJobs } from '../generation/job-store'
import { useJobs } from '../generation/use-jobs'
import { draftToggles, rememberConfirmed, restoreToggles, type ToggleValues } from '../toggles'
import { startInputs } from '../workspace/batch-request'
import { homeCta, type HomeViewer } from './home-cta'
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

type Restore = { signedIn: boolean; apply(draft: HomeDraft): void; pick(file: File): void }

// Brings back what a signed-out visitor set up before sign-up, once. Signed in, the photo now
// uploads and the draft is spent.
function useRestoreDraft({ signedIn, apply, pick }: Restore) {
  const done = useRef(false)
  useEffect(() => {
    if (done.current) return
    done.current = true
    void loadDraft().then((found) => {
      if (!found) return
      apply(found.draft)
      if (found.photo) pick(found.photo)
      if (signedIn) void clearDraft()
    })
  }, [signedIn, apply, pick])
}

// Starts the photo exactly as the workspace does (DESIGN §6.9 item 9): one job in the
// generation store (reserve → generate on /api/generate), shown by that template's workspace,
// which is where the visitor lands, on the same job id.
function useStart(viewer: HomeViewer | null, template: CatalogueTemplate | null, photo: HomePhoto) {
  const router = useRouter()
  return useCallback(
    (aspect: OutputAspect, note: string, toggles: ToggleValues) => {
      if (!viewer || !template || !photo.inputKey || !photo.url) return
      const upload = { phase: 'done' as const, inputKey: photo.inputKey }
      const ready = [{ photo: { id: 'home', url: photo.url, bytes: photo.file?.size ?? 0, ratio: null, upload }, inputKey: photo.inputKey }]
      const ids = enqueueJobs(startInputs(template, { aspect, resolution: '1k', note, copy: {}, toggles }, ready), viewer.concurrency.limit)
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
  // The chosen template's toggles (T89): a choice belongs to the template it was made on, so
  // picking another template starts from all off (and its own confirm dialog).
  const [chosen, setChosen] = useState<{ templateId: string | null; values: ToggleValues }>({ templateId: null, values: {} })
  const toggles = template && chosen.templateId === template.id ? chosen.values : {}
  const setToggles = useCallback((values: ToggleValues) => setChosen({ templateId: template?.id ?? null, values }), [template])
  const photo = useHomePhoto(viewer !== null)
  const apply = useCallback(
    (draft: HomeDraft) => {
      const saved = templates.find((candidate) => candidate.id === draft.templateId)
      if (saved) {
        setTemplateId(saved.id)
        // The confirmed toggles stay on, and count as confirmed for this session (T89).
        const values = restoreToggles(saved.toggles, draft)
        setChosen({ templateId: saved.id, values })
        for (const key of draft.confirmed.filter((confirmed) => values[confirmed])) rememberConfirmed(saved.id, key)
      }
      setAspect(draft.aspect)
      setNote(draft.note)
    },
    [templates],
  )
  useRestoreDraft({ signedIn: viewer !== null, apply, pick: photo.pick })
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
    toggles,
    setToggles,
    photo,
    cta,
    generate: () => start(aspect, note.trim(), toggles),
    // Before the sign-up prompt: what to bring back afterwards.
    keepDraft: () => (template ? saveDraft({ templateId: template.id, aspect, note, ...draftToggles(template.toggles, toggles) }, photo.file) : Promise.resolve()),
  }
}

export type HomeGeneratorState = ReturnType<typeof useHomeGenerator>
