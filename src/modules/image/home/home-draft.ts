import { NOTE_MAX_LENGTH, OUTPUT_ASPECTS, type OutputAspect } from '@/core/templates/output-options'

// What a signed-out visitor set up on the home generator, kept in this browser across the
// sign-up / log-in round trip (DESIGN §6.9 item 9): template, size and note in localStorage
// (a confirmation link may open in a new tab, so not sessionStorage), the photo itself in
// IndexedDB. Nothing leaves the browser until the visitor is signed in and the photo uploads.
// A draft older than a day is dropped.
const KEY = 'shotviva.home-draft'
const DB = 'shotviva-home'
const STORE = 'draft'
const PHOTO = 'photo'
export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000

// No template toggles: the home bar does not offer them (Owner 2026-11-12); a draft saved while it
// did simply has its toggle keys ignored.
export type HomeDraft = {
  templateId: string
  aspect: OutputAspect
  note: string
  savedAt: number
  hasPhoto: boolean
}

type RawDraft = Record<string, unknown>

function isFresh(savedAt: unknown, now: number): savedAt is number {
  return typeof savedAt === 'number' && savedAt <= now && now - savedAt <= DRAFT_TTL_MS
}

function toDraft({ templateId, aspect, note, savedAt, hasPhoto }: RawDraft, now: number): HomeDraft | null {
  const size = OUTPUT_ASPECTS.find((option) => option === aspect)
  if (typeof templateId !== 'string' || typeof note !== 'string' || !size || !isFresh(savedAt, now)) return null
  return { templateId, aspect: size, note: note.slice(0, NOTE_MAX_LENGTH), savedAt, hasPhoto: hasPhoto === true }
}

export function parseDraft(raw: string | null, now: number): HomeDraft | null {
  try {
    const value: unknown = raw ? JSON.parse(raw) : null
    return value && typeof value === 'object' ? toDraft(value as RawDraft, now) : null
  } catch {
    return null
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('indexedDB open failed'))
  })
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = run(db.transaction(STORE, mode).objectStore(STORE))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('indexedDB request failed'))
    })
  } finally {
    db.close()
  }
}

// Private mode or a full disk only loses the draft; the visitor picks the photo again.
export async function saveDraft(draft: Omit<HomeDraft, 'savedAt' | 'hasPhoto'>, photo: Blob | null): Promise<void> {
  let hasPhoto = false
  try {
    if (photo) {
      await withStore('readwrite', (store) => store.put(photo, PHOTO))
      hasPhoto = true
    }
  } catch {
    // no photo kept
  }
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...draft, savedAt: Date.now(), hasPhoto }))
  } catch {
    // no draft kept
  }
}

export async function loadDraft(): Promise<{ draft: HomeDraft; photo: File | null } | null> {
  let draft: HomeDraft | null = null
  try {
    draft = parseDraft(localStorage.getItem(KEY), Date.now())
  } catch {
    return null
  }
  if (!draft) return null
  let photo: File | null = null
  if (draft.hasPhoto) {
    try {
      const blob = await withStore<unknown>('readonly', (store) => store.get(PHOTO))
      if (blob instanceof Blob) photo = new File([blob], 'photo', { type: blob.type })
    } catch {
      // the template and note still come back
    }
  }
  return { draft, photo }
}

export async function clearDraft(): Promise<void> {
  try {
    localStorage.removeItem(KEY)
    await withStore('readwrite', (store) => store.delete(PHOTO))
  } catch {
    // nothing to clear
  }
}
