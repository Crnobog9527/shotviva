import 'server-only'

import { onServerError } from '../analytics/server-errors'
import { runtimeFeishuConfig } from './runtime-config'
import { schedule } from './schedule'
import { createErrorWindow, recordServerError } from './site-errors'

const window = createErrorWindow()
let delivery: ReturnType<typeof import('./notify').getSiteErrorDelivery> | undefined
let pending = false

// Count from the first error. Loading the delivery stack belongs to the first alert's
// after() callback, so a healthy request never waits for it.
export function registerOwnerErrorAlerts(): void {
  onServerError((signal) => {
    if (!runtimeFeishuConfig()) return
    const breach = recordServerError(window, signal, Date.now())
    if (!breach || pending || delivery === null || (delivery && !delivery.canSend())) return
    pending = true
    schedule(async () => {
      try {
        delivery ??= (await import('./notify')).getSiteErrorDelivery()
        if (delivery?.canSend()) await delivery.send(breach)
      } finally {
        pending = false
      }
    })
  })
}
