import type { Resolution } from '@/core/templates/output-options'

// What the admin test-run panel receives (ARCHITECTURE §10.b, T85). Client-safe, and kept in core
// so the panel (core/admin/test-run-ui) and the server side (modules/image/test-run) share it.
// Images come as 10-minute signed GET URLs of the private bucket.

export type TestBudget = { budgetUsd: number; spentUsd: number; runs: number; day: string }

// 'translate': a cover's 「生成其他语言版本」 (T87), no parent run and no test photo.
export type TestRunKind = 'generate' | 'edit' | 'translate'
export type TestRunStatus = 'running' | 'succeeded' | 'failed'

export type TestRunView = {
  id: string
  kind: TestRunKind
  parentId: string | null
  photoDeleted?: boolean
  photoId: string | null
  batchId: string
  status: TestRunStatus
  resolution: Resolution
  aspectRatio: string | null
  // The template's text fields and the note (first runs), or the words of an edit.
  copy: Record<string, string>
  note: string | null
  // The template's toggles as run (T89), key → on; {} when it has none.
  toggles: Record<string, boolean>
  instruction: string | null
  // A translation (T87): the cover it started from (null = the common cover) and the language
  // it was translated into.
  sourceLocale: string | null
  targetLocale: string | null
  editScope: string | null
  styleRefCount: number
  promptVersion: number | null
  model: string | null
  receiptDetail?: string
  costUsd: number | null
  estimateUsd: number
  durationMs: number | null
  errorCode: string | null
  isCover: boolean
  createdAt: string
  thumbnailUrl?: string | null
  outputUrl: string | null
}

export type TestPhotoView = { id: string; url: string; lastUsedAt: string }

export type TestPanelData = {
  runs: TestRunView[]
  // 「最近用过的测试照片」, newest first.
  recentPhotos: TestPhotoView[]
  // Every photo a listed run started from, by id (the "before" side of a compare).
  photoUrls: Record<string, string>
  budget: TestBudget
}

