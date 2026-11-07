import type { EvidenceFacts, EvidenceWork } from './facts'

// access_activity_log (T82): the account's own record, one line per fact, UTC, so the bank sees
// the cardholder sign up, pay and then use what they bought. Stripe caps each text field at
// 20,000 characters; lines are dropped from the end (with a count) rather than cut mid-line.

export const FIELD_LIMIT = 20_000

export const utc = (at: Date) => `${at.toISOString().slice(0, 16).replace('T', ' ')} UTC`

const orUnknown = (value: string | null) => value ?? 'not recorded'

function workLine(work: EvidenceWork): string {
  const download =
    work.download_count > 0 && work.downloaded_at
      ? `downloaded ${work.download_count}x (first ${utc(work.downloaded_at)}, IP ${orUnknown(work.download_ip)})`
      : 'viewed on the website'
  const size = work.resolution ? `, ${work.resolution}` : ''
  const credits = `${work.credits_cost} ${work.credits_cost === 1 ? 'credit' : 'credits'}`
  return `- ${utc(work.created_at)} · IP ${orUnknown(work.client_ip)} · image created (${work.template_id}${size}, ${credits}) · ${download}`
}

function header(facts: EvidenceFacts): string[] {
  const lines: string[] = []
  if (facts.user?.signed_up_at) lines.push(`Account created: ${utc(facts.user.signed_up_at)}, sign-up IP ${orUnknown(facts.user.signup_ip)}`)
  const pay = facts.payment
  if (pay) {
    const source = pay.context_from === 'first_payment' ? ' (from the first payment of this subscription)' : ''
    lines.push(`Payment: ${utc(pay.created_at)}${pay.renewal ? ' (automatic renewal of an active subscription)' : ''}`)
    lines.push(`Checkout IP: ${orUnknown(pay.purchase_ip)}${source}`)
    if (pay.purchase_user_agent) lines.push(`Checkout browser: ${pay.purchase_user_agent}`)
    if (pay.terms_accepted_at) lines.push(`Terms of Service and Refund Policy accepted at checkout (required checkbox): ${utc(pay.terms_accepted_at)}`)
  }
  return lines
}

// Keeps whole lines within the limit and says how many were left out.
export function fitLines(lines: readonly string[], limit = FIELD_LIMIT): string {
  const kept: string[] = []
  let size = 0
  for (const [index, line] of lines.entries()) {
    const rest = lines.length - index
    if (size + line.length + 1 > limit - 60) {
      kept.push(`… ${rest} more line(s) not shown`)
      break
    }
    kept.push(line)
    size += line.length + 1
  }
  return kept.join('\n')
}

export function activityLog(facts: EvidenceFacts): string {
  const shown = facts.works.length
  const more = facts.totals.count - shown
  const works = facts.works.map(workLine)
  const usage = facts.payment
    ? [`Paid images created after this payment and before the dispute: ${facts.totals.count} (${facts.totals.credits} credits), ${facts.totals.downloaded} downloaded`, ...works]
    : []
  if (more > 0) usage.push(`… and ${more} more images, same account`)
  return fitLines([...header(facts), ...usage])
}

// How many works came from the checkout IP: the strongest single sign that the cardholder used it.
export function ipMatches(facts: EvidenceFacts): { matching: number; known: number } {
  const purchaseIp = facts.payment?.purchase_ip
  const known = facts.works.filter((w) => w.client_ip !== null)
  if (!purchaseIp) return { matching: 0, known: known.length }
  return { matching: known.filter((w) => w.client_ip === purchaseIp).length, known: known.length }
}
