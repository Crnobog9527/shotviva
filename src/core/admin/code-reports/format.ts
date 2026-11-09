import { percentZh, type InviteConfig } from '../../codes'
import { formatMinor } from '../orders'
import { COPY } from './copy'
import type { CodeRow, RedemptionRow } from './schemas'

export function effects(code: CodeRow, invite: InviteConfig) {
  if (code.kind === 'invite') return [COPY.inviteEffect(invite.inviteeCredits, invite.inviterCredits)]
  const parts = []
  if (code.invitee_credits) parts.push(COPY.gift(code.invitee_credits, code.invitee_pool === 'paid'))
  if (code.discount_percent && code.discount_duration) {
    const term = code.discount_duration === 'repeating' ? COPY.duration.repeating(code.discount_months!) : COPY.duration[code.discount_duration]
    parts.push(`${percentZh(code.discount_percent)} · ${term}`)
    parts.push((code.discount_products ?? []).map(id => COPY.products[id] ?? id).join('、'))
    if (code.discount_valid_days) parts.push(COPY.validDays(code.discount_valid_days))
  }
  return parts
}

export function totals(amounts: CodeRow['amounts'], field: 'net' | 'discount') {
  return Object.entries(amounts).sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, value]) => `${currency.toUpperCase()} ${formatMinor(value[field], currency)}`).join(' / ') || COPY.blank
}

export function discountState(row: RedemptionRow, hasDiscount: boolean, now: number) {
  if (row.status !== 'ok' || !hasDiscount) return COPY.blank
  if (row.discount_used_payment_id) return `${COPY.used} · ${COPY.payment(row.discount_used_payment_id)}`
  if (row.discount_void_at) return COPY.replaced
  if (row.discount_expires_at && Date.parse(row.discount_expires_at) <= now) return COPY.expired
  return COPY.pending
}
