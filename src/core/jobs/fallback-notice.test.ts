import { beforeEach, expect, it, vi } from 'vitest'
import { notifyOwner } from '../alerts'
import { alertPolicy } from '../alerts/alert-kinds'
import { renderAlert } from '../alerts/templates'
import { routeFallbackReason, withFallbackNotice } from './fallback-notice'

vi.mock('../alerts', () => ({ notifyOwner: vi.fn() }))
beforeEach(() => vi.clearAllMocks())

it.each(['catalog_unavailable', 'model_missing', 'unsupported_resolution', 'partner_channel'])(
  'reports both outcomes of %s under one rolling hourly key', async reason => {
    const provider = { id: 'default/model', fallbackReason: reason, generate: vi.fn() }
    const source = reason === 'partner_channel' ? 'graylum' : 'web'
    const selectedReason = routeFallbackReason(provider, 'cheap', source)
    for (const rejected of [false, true]) {
      const run = withFallbackNotice('fixture', async selected => {
        selected(selectedReason)
        if (rejected) throw new Error('floor')
      })
      if (rejected) await expect(run).rejects.toThrow('floor')
      else await run
      const alert = { kind: 'template_fallback' as const, templateId: 'fixture', reason, rejected }
      expect(notifyOwner).toHaveBeenLastCalledWith(alert)
      expect(alertPolicy(alert)).toMatchObject({ key: `template_fallback:fixture:${reason}`, cooldownMs: 3_600_000 })
      expect(renderAlert(alert, { who: null, origin: '', testSite: false }).sentence)
        .toContain(rejected ? '已拒绝' : '已允许')
    }
    expect(routeFallbackReason(provider, 'default', source)).toBeUndefined()
    expect(routeFallbackReason(provider, null, source)).toBeUndefined()
  },
)
