import type { ObjectStore } from '@/core/storage'

type Entry = { body: Uint8Array; contentType: string | null }

// In-memory ObjectStore: what R2 would hold, minus the network (AGENTS §7: R2 is faked).
export function createMemoryStore() {
  const objects = new Map<string, Entry>()
  const failPut = { next: false }
  const failCopy = { next: false }
  const store: ObjectStore = {
    presignPut: async (key, contentType, expires) => `memory://put/${key}?type=${contentType}&expires=${expires}`,
    presignGet: async (key, { expiresInSeconds, downloadName }) =>
      `memory://get/${key}?expires=${expiresInSeconds}${downloadName ? `&download=${downloadName}` : ''}`,
    head: async (key) => {
      const entry = objects.get(key)
      return entry ? { size: entry.body.length, contentType: entry.contentType } : null
    },
    get: async (key) => {
      const entry = objects.get(key)
      if (!entry) throw new Error(`NoSuchKey ${key}`)
      return entry.body
    },
    put: async (key, body, contentType) => {
      if (failPut.next) {
        failPut.next = false
        throw new Error('simulated R2 outage')
      }
      objects.set(key, { body, contentType })
    },
    putIfAbsent: async (key, body, contentType) => {
      if (objects.has(key)) return false
      objects.set(key, { body, contentType })
      return true
    },
    copy: async (sourceKey, destinationKey) => {
      if (failCopy.next) {
        failCopy.next = false
        throw new Error('simulated R2 copy failure')
      }
      const entry = objects.get(sourceKey)
      if (!entry) throw new Error(`NoSuchKey ${sourceKey}`)
      objects.set(destinationKey, { ...entry })
    },
    delete: async (key) => {
      objects.delete(key)
    },
    deletePrefix: async (prefix) => {
      for (const key of [...objects.keys()]) if (key.startsWith(prefix)) objects.delete(key)
    },
  }
  // Simulates a browser PUT straight to the bucket (whatever bytes and type it claims).
  const upload = (key: string, body: Uint8Array, contentType: string | null) => objects.set(key, { body, contentType })
  return { store, objects, upload, failPut, failCopy }
}
