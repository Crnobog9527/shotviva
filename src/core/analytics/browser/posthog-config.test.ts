import type { CaptureResult } from 'posthog-js'
import { describe, expect, it } from 'vitest'

import { posthogConfig, scrubCapture, scrubUrl } from './posthog-config'

describe('posthogConfig (ARCHITECTURE §16.1)', () => {
  it('stores nothing in the browser and records no sessions', () => {
    expect(posthogConfig()).toMatchObject({
      persistence: 'memory',
      disable_session_recording: true,
      disable_surveys: true,
      disable_product_tours: true,
      person_profiles: 'identified_only',
    })
  })

  it('sends through the same-origin /ingest proxy', () => {
    expect(posthogConfig()).toMatchObject({ api_host: '/ingest', ui_host: 'https://us.posthog.com' })
  })
})

describe('scrubCapture', () => {
  const capture = (properties: Record<string, unknown>) => ({ uuid: '1', event: '$autocapture', properties }) as CaptureResult

  it('drops auth codes and tokens from URLs but keeps campaign params', () => {
    expect(scrubUrl('https://shotviva.com/auth/callback?code=abc&next=%2Fgenerate&utm_source=x#access_token=t')).toBe(
      'https://shotviva.com/auth/callback?next=%2Fgenerate&utm_source=x',
    )
    const scrubbed = scrubCapture(capture({ $current_url: 'https://shotviva.com/reset?token=secret&email=a%40b.co' }))
    expect(scrubbed?.properties.$current_url).toBe('https://shotviva.com/reset')
  })

  it('masks emails in any string property, such as autocaptured element text', () => {
    const scrubbed = scrubCapture(capture({ $el_text: 'Signed in as jane@example.com', $elements_chain: 'a:text="jane@example.com"' }))
    expect(JSON.stringify(scrubbed)).not.toContain('jane@example.com')
  })

  it('passes a dropped event through', () => {
    expect(scrubCapture(null)).toBeNull()
  })
})
