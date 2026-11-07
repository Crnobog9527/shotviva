import type Stripe from 'stripe'
import { describe, expect, it } from 'vitest'

import { contextOf } from './payment-context'

// T82: what record_payment_context receives from a settled session.
const at = new Date('2026-11-08T10:00:00Z')
const session = (over: Partial<Stripe.Checkout.Session>) => ({ id: 'cs_test_1', metadata: {}, ...over }) as Stripe.Checkout.Session

describe('contextOf', () => {
  it('reads the IP and browser checkout stored, consent and the Managed Payments flag', () => {
    const s = session({
      metadata: { buyer_ip: '2001:db8::1', buyer_ua: 'UA' },
      consent: { terms_of_service: 'accepted', promotions: null } as Stripe.Checkout.Session.Consent,
      managed_payments: { enabled: true } as Stripe.Checkout.Session['managed_payments'],
    })
    expect(contextOf(s, at)).toEqual({ p_session_id: 'cs_test_1', p_ip: '2001:db8::1', p_user_agent: 'UA', p_terms_accepted_at: at.toISOString(), p_managed_payments: true })
  })

  it('drops a value that is not an IP and records no consent when the box was not asked', () => {
    expect(contextOf(session({ metadata: { buyer_ip: 'not-an-ip' } }), at)).toEqual({
      p_session_id: 'cs_test_1',
      p_ip: null,
      p_user_agent: null,
      p_terms_accepted_at: null,
      p_managed_payments: null,
    })
  })
})
