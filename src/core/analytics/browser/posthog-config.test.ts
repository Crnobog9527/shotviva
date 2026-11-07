import type { CaptureResult } from 'posthog-js'
import { describe, expect, it } from 'vitest'

import type { Consent } from '../consent/decision'
import { REPLAY_BLOCK_CLASS } from '../replay'
import { posthogConfig, scrubCapture, scrubUrl } from './posthog-config'

const outsideEurope: Consent = { regionOpen: true, choice: null }
const european: Consent = { regionOpen: false, choice: null }

describe('posthogConfig (ARCHITECTURE §16.1, T70)', () => {
  it('uses cookies outside Europe and leaves replay to the PostHog project', () => {
    expect(posthogConfig(outsideEurope, '/')).toMatchObject({
      persistence: 'localStorage+cookie',
      disable_session_recording: false,
      disable_surveys: true,
      disable_product_tours: true,
      person_profiles: 'identified_only',
    })
  })

  it('stores nothing and records nothing for a European visitor who has not accepted', () => {
    expect(posthogConfig(european, '/')).toMatchObject({ persistence: 'memory', disable_session_recording: true })
    expect(posthogConfig({ ...european, choice: 'necessary' }, '/')).toMatchObject({ persistence: 'memory', disable_session_recording: true })
    expect(posthogConfig({ ...european, choice: 'accepted' }, '/')).toMatchObject({ persistence: 'localStorage+cookie', disable_session_recording: false })
  })

  it('never records /admin or the checkout return page', () => {
    expect(posthogConfig(outsideEurope, '/admin/users')).toMatchObject({ disable_session_recording: true })
    expect(posthogConfig(outsideEurope, '/zh/checkout')).toMatchObject({ disable_session_recording: true })
  })

  it('masks every input and blocks the users\' photos in replay', () => {
    expect(posthogConfig(outsideEurope, '/').session_recording).toEqual({ maskAllInputs: true, blockSelector: `.${REPLAY_BLOCK_CLASS}` })
  })

  it('sends through the same-origin /ingest proxy', () => {
    expect(posthogConfig(outsideEurope, '/')).toMatchObject({ api_host: '/ingest', ui_host: 'https://us.posthog.com' })
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
