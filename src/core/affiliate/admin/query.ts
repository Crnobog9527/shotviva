import { z } from 'zod'

export const tabs = ['overview', 'applications', 'affiliates', 'commissions', 'payouts', 'attribution', 'settings', 'errors'] as const
export const categories = ['pack', 'monthly', 'yearly'] as const
const blank = (value: unknown) => (value === '' ? undefined : value)
const optional = <T extends z.ZodType>(type: T) => z.preprocess(blank, type.optional())
const filter = z
  .object({
    tab: z.enum(tabs).default('overview'),
    review: optional(z.enum(['pending', 'rejected'])),
    q: optional(z.string().trim().max(254)),
    id: optional(z.uuid()),
    affiliate: optional(z.uuid()),
    status: optional(z.enum(['confirmed', 'pending', 'on_hold', 'void', 'paid', 'due', 'held'])),
    flag: optional(z.enum(['yes', 'no'])),
    period: optional(z.iso.date()),
    from: optional(z.iso.date()),
    until: optional(z.iso.date()),
    section: optional(z.enum(['referrals', 'adjustments'])),
    cursor: optional(z.string().min(1).max(400)),
  })
  .refine((q) => !q.from || !q.until || q.from <= q.until)
export const parseFilters = (input: unknown) => filter.safeParse(input)
export type Filters = z.infer<typeof filter>
export const adminPath = '/admin/affiliates'
export function href(query: Filters, base = adminPath) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) if (value) search.set(key, value)
  return base + '?' + search.toString()
}
export function endExclusive(day: string) {
  const date = new Date(day + 'T00:00:00Z')
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString()
}
