import type { GenerationProvider, ImageRequestOptions } from '../../src/core/jobs'
import type { TestRun } from '../../src/modules/image/test-run/test-run-row'
import type { Cell } from './cells'

// A template bound to a provider never falls back to the default model in a trial. The app falls
// back so a customer still gets an image; a trial on another model would report a result the bound
// model never made, so the run stops instead.

export class BoundProviderUnavailable extends Error {
  constructor(readonly providerId: string, readonly reason: string) {
    super(`模板绑定的线路 ${providerId} 现在用不了（${reason}）。试跑不会换成默认模型，已停止。`)
    this.name = 'BoundProviderUnavailable'
  }
}

type Resolve = (id: string | null, request: ImageRequestOptions) => Promise<GenerationProvider>

// The bound route's provider, or BoundProviderUnavailable when the route fell back. A template
// with no bound provider (id null) uses the default model as it always does.
export function refuseFallback(resolve: Resolve): Resolve {
  return async (id, request) => {
    const provider = await resolve(id, request)
    if (id && provider.fallbackReason) throw new BoundProviderUnavailable(id, provider.fallbackReason)
    return provider
  }
}

// A result made by another provider than the cell's (a fallback before trials refused one) is not
// that cell's result: the cell runs again on its own provider. Runs store `<provider id>/<model>`.
export const ranOnCellProvider = (run: Pick<TestRun, 'provider'>, cell: Pick<Cell, 'providerId'>) =>
  !run.provider || run.provider.startsWith(`${cell.providerId}/`)
