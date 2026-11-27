import { isPublicCatalogue, type PublicCatalogue } from './public-catalogue'

// The device copy of Create's public catalogue (public-catalogue.ts), one record per language in
// IndexedDB. Public data only: nothing per account is ever written here. Every failure (no
// IndexedDB, private mode, a quota, a record of another schema, a parse error) reads as "no copy":
// the record is dropped and the grid is fetched fresh, so a broken cache never blocks the grid.
const DB_NAME = 'shotviva-catalogue'
const STORE = 'catalogue'

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null)
      const request = indexedDB.open(DB_NAME, 1)
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE)
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
      request.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

function run<T>(mode: IDBTransactionMode, act: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return open().then((db) => new Promise<T | null>((resolve) => {
    if (!db) return resolve(null)
    try {
      const request = act(db.transaction(STORE, mode).objectStore(STORE))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
    } catch {
      resolve(null)
    } finally {
      db.close()
    }
  }))
}

export async function readDeviceCatalogue(locale: string): Promise<PublicCatalogue | null> {
  const record = await run<unknown>('readonly', (store) => store.get(locale))
  if (record === null || record === undefined) return null
  if (isPublicCatalogue(record, locale)) return record
  await dropDeviceCatalogue(locale)
  return null
}

export async function writeDeviceCatalogue(file: PublicCatalogue): Promise<void> {
  await run('readwrite', (store) => store.put(file, file.locale))
}

export async function dropDeviceCatalogue(locale: string): Promise<void> {
  await run('readwrite', (store) => store.delete(locale))
}

const BASE = '/api/catalogue/public'

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, { credentials: 'omit' })
  if (!response.ok) throw new Error(`catalogue ${response.status}`)
  return response.json()
}

// The newest file: `latest` when nothing is on the device, else `current` (a few bytes) and the
// immutable versioned file only when the version moved. null: nothing newer than `have`.
export async function fetchNewerCatalogue(locale: string, have: string | null): Promise<PublicCatalogue | null> {
  if (have === null) {
    const file = await getJson(`${BASE}/${locale}/latest`)
    if (!isPublicCatalogue(file, locale)) throw new Error('catalogue: unexpected file')
    return file
  }
  const current = (await getJson(`${BASE}/${locale}/current`)) as { version?: unknown }
  if (typeof current.version !== 'string' || current.version === have) return null
  const file = await getJson(`${BASE}/${locale}/${current.version}`)
  if (!isPublicCatalogue(file, locale)) throw new Error('catalogue: unexpected file')
  return file
}
