// Browser side of the test-run panel (ARCHITECTURE §10.b, T85): plain fetches to /api/admin/test-*
// (route handlers, not server actions: actions from one page run one at a time, and a ×3 batch
// must run its three requests together). Every failure becomes a TestRunError with the code.

import { checkPickedFile, compressImage, putWithProgress } from '@/core/storage/upload'
import type { OutputAspect, Resolution } from '@/core/templates/output-options'

import type { TestBudget, TestPanelData, TestPhotoView, TestRunView } from '../test-runs'

export class TestRunError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'TestRunError'
  }
}

function request(url: string, init?: { method?: string; body?: unknown }): Promise<Response> {
  const json = init?.body !== undefined
  return fetch(url, {
    method: init?.method ?? 'GET',
    headers: json ? { 'Content-Type': 'application/json' } : undefined,
    body: json ? JSON.stringify(init.body) : undefined,
  }).catch(() => {
    throw new TestRunError('NETWORK', 'network')
  })
}

type Failure = { code?: string; message?: string }

async function call<T>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const response = await request(url, init)
  const body = (await response.json().catch(() => null)) as (T & Failure) | null
  if (response.ok && body !== null) return body
  throw new TestRunError(body?.code ?? 'INTERNAL', body?.message ?? `HTTP ${response.status}`)
}

// cleanup: when the panel opens, the 30-day cleanup runs first (a POST: it deletes data).
export async function loadPanel(templateId: string, cleanup: boolean): Promise<TestPanelData> {
  if (cleanup) await call<{ ok: true }>('/api/admin/test-runs/cleanup', { method: 'POST', body: {} })
  return call<TestPanelData>(`/api/admin/test-runs?template_id=${encodeURIComponent(templateId)}`)
}

export type GenerateInput = {
  omitStyleRefs: boolean
  runId: string
  batchId: string
  templateId: string
  providerId: string | null
  photoId: string | null
  copy: Record<string, string>
  note: string
  toggles: Record<string, boolean>
  resolution: Resolution
  aspect: OutputAspect
}

export const startGenerate = (input: GenerateInput) =>
  call<TestRunView>('/api/admin/test-runs', {
    method: 'POST',
    body: {
      run_id: input.runId,
      batch_id: input.batchId,
      template_id: input.templateId,
      photo_id: input.photoId,
      provider_id: input.providerId,
      omit_style_refs: input.omitStyleRefs,
      inputs: { copy: input.copy, note: input.note, toggles: input.toggles, resolution: input.resolution, aspect_ratio: input.aspect },
    },
  })

export type EditInput = { runId: string; batchId: string; parentId: string; instruction: string; resolution?: Resolution; aspect?: OutputAspect }

export const startEdit = (input: EditInput) =>
  call<TestRunView>('/api/admin/test-runs/edit', {
    method: 'POST',
    body: {
      run_id: input.runId,
      batch_id: input.batchId,
      parent_id: input.parentId,
      instruction: input.instruction,
      resolution: input.resolution,
      aspect_ratio: input.aspect,
    },
  })

// locale: null = the common cover, a code = that language's own (T87).
export const setCover = (runId: string, locale: string | null = null) =>
  call<{ template_id: string }>(`/api/admin/test-runs/${runId}/cover`, { method: 'POST', body: { locale } })

export type TranslateInput = { runId: string; batchId: string; templateId: string; sourceLocale: string | null; targetLocale: string; resolution: Resolution }

// 「生成其他语言版本」 (T87): one language per request.
export const startTranslate = (input: TranslateInput) =>
  call<TestRunView>('/api/admin/test-runs/translate', {
    method: 'POST',
    body: {
      run_id: input.runId,
      batch_id: input.batchId,
      template_id: input.templateId,
      source_locale: input.sourceLocale,
      target_locale: input.targetLocale,
      resolution: input.resolution,
    },
  })

export const saveBudget = (budgetUsd: number) => call<TestBudget>('/api/admin/test-runs/budget', { method: 'POST', body: { budget_usd: budgetUsd } })

type Ticket = { photo_id: string; key: string; put_url: string; headers: Record<string, string> }

// The user's upload path (ARCHITECTURE §8.2): checked, compressed in the browser, PUT straight to
// R2; then confirmed so it shows under 「最近用过」.
export async function uploadTestPhoto(file: File, onProgress: (fraction: number) => void): Promise<TestPhotoView> {
  try {
    checkPickedFile(file)
  } catch (error) {
    throw new TestRunError('IMAGE_UNSUPPORTED', error instanceof Error ? error.message : 'unsupported')
  }
  const compressed = await compressImage(file).catch(() => null)
  const body = compressed ?? file
  const ticket = await call<Ticket>('/api/admin/test-photos', { method: 'POST', body: { content_type: body.type, size: body.size } })
  await putWithProgress(ticket.put_url, body, ticket.headers, onProgress).catch(() => {
    throw new TestRunError('UPLOAD_FAILED', '上传失败，请检查网络后重试')
  })
  return call<TestPhotoView>(`/api/admin/test-photos/${ticket.photo_id}`, { method: 'POST', body: { key: ticket.key } })
}
