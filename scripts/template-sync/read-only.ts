import type { SupabaseClient } from '@supabase/supabase-js'

import type { Assets } from './covers'
import { SyncError } from './covers'
import type { PrivateStore } from './style-refs'
import type { SyncTarget } from './sync'

// The production side of a production → preview run (2026-11-14) is read, never written: its
// client answers only the sync's read_* functions and table selects, and its buckets only head and
// get. Anything else throws here, before a request leaves the runner, so a mistake in the sync code
// cannot reach production even though the runner holds production's service key.

const READ_RPC = /^read_[a-z_]+$/

function readOnlyDb(db: SupabaseClient): SupabaseClient {
  const guarded = {
    rpc(name: string, args?: object) {
      if (!READ_RPC.test(name)) throw new SyncError('SOURCE_WRITE_REFUSED')
      return db.rpc(name, args as never)
    },
    from(table: string) {
      const query = db.from(table)
      return { select: query.select.bind(query) }
    },
  }
  return new Proxy(guarded, {
    get(target, prop) {
      if (prop === 'rpc' || prop === 'from') return target[prop]
      throw new SyncError('SOURCE_WRITE_REFUSED')
    },
  }) as unknown as SupabaseClient
}

function readOnlyStore<T extends Pick<PrivateStore, 'head' | 'get'>>(store: T): PrivateStore {
  return {
    head: (key) => store.head(key),
    get: (key, max) => store.get(key, max),
    put: async () => { throw new SyncError('SOURCE_WRITE_REFUSED') },
  }
}

export function readOnlySide(side: SyncTarget): SyncTarget {
  const assets: Assets = { base: side.assets.base, store: readOnlyStore(side.assets.store) }
  return { db: readOnlyDb(side.db), assets, ...(side.private ? { private: readOnlyStore(side.private) } : {}) }
}
