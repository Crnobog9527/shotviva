import 'server-only'

import type { ObjectStore } from './object-store'

// What core/auth's account deletion needs from storage (its AccountStorage type).
export function accountStorage(store: () => ObjectStore): { deletePrefix(prefix: string): Promise<void> } {
  return { deletePrefix: (prefix) => store().deletePrefix(prefix) }
}
