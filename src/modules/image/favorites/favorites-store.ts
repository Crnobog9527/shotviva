// Saved templates in the browser (ARCHITECTURE §5.1b, T83). A tap shows at once (optimistic);
// the server is told in the background, one request at a time per template, always for the
// latest state asked for, so fast double taps cannot land out of order. A refused request
// rolls the template back to what the server last confirmed, in its old place.

export type SendResult = { ok: true } | { ok: false; code: string | null }
export type Send = (templateId: string, saved: boolean) => Promise<SendResult>
// limit: the 200 cap; unavailable: the template is not live (unpublished, partner-only, gone).
export type FavoriteFailure = 'limit' | 'unavailable' | 'failed'

type Events = {
  // The server has it: analytics fires here, so a rolled-back tap is never counted.
  onSynced?(templateId: string, saved: boolean): void
  onFailed?(templateId: string, failure: FavoriteFailure): void
}

export type FavoritesStore = {
  ids(): readonly string[]
  subscribe(listener: () => void): () => void
  set(templateId: string, saved: boolean): void
}

export function failureOf(code: string | null): FavoriteFailure {
  if (code === 'FAVORITES_LIMIT') return 'limit'
  return code === 'NOT_FOUND' ? 'unavailable' : 'failed'
}

// Newest first: taps not yet confirmed (latest tap first), then the server's list without them.
function project(confirmed: readonly string[], pending: ReadonlyMap<string, boolean>): string[] {
  const added = [...pending].filter(([, saved]) => saved).map(([id]) => id).reverse()
  return [...added, ...confirmed.filter((id) => !pending.has(id))]
}

export function createFavoritesStore(initial: readonly string[], send: Send, events: Events = {}): FavoritesStore {
  let confirmed = [...initial]
  const pending = new Map<string, boolean>()
  const inflight = new Set<string>()
  const listeners = new Set<() => void>()
  let snapshot: readonly string[] = confirmed

  const publish = () => {
    snapshot = project(confirmed, pending)
    listeners.forEach((listener) => listener())
  }

  async function flush(id: string) {
    if (inflight.has(id)) return
    while (pending.has(id)) {
      const saved = pending.get(id) as boolean
      if (saved === confirmed.includes(id)) {
        pending.delete(id)
        publish()
        break
      }
      inflight.add(id)
      const result = await send(id, saved).catch((): SendResult => ({ ok: false, code: null }))
      inflight.delete(id)
      if (!result.ok) {
        pending.delete(id)
        publish()
        events.onFailed?.(id, failureOf(result.code))
        return
      }
      confirmed = saved ? [id, ...confirmed.filter((other) => other !== id)] : confirmed.filter((other) => other !== id)
      if (pending.get(id) === saved) pending.delete(id)
      publish()
      events.onSynced?.(id, saved)
    }
  }

  return {
    ids: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    set(id, saved) {
      // Re-inserted so the latest tap counts as the newest.
      pending.delete(id)
      pending.set(id, saved)
      publish()
      void flush(id)
    },
  }
}

// The saved templates still in this catalogue (live on the web), in saved order.
export function savedIn<T extends { id: string }>(ids: readonly string[], templates: readonly T[]): T[] {
  const byId = new Map(templates.map((template) => [template.id, template]))
  return ids.flatMap((id) => byId.get(id) ?? [])
}
