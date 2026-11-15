import { z } from 'zod'

// The shape admin.catalog_policy() accepts (1127) and admin_set_system_setting checks (1568):
// exactly five basis-point integers, payment + refund + the larger commission under 100%.
const bp = z.number().int().min(0).max(9999)
const policySchema = z.strictObject({
  payment_bp: bp, refund_bp: bp, yearly_commission_bp: bp, other_commission_bp: bp, margin_bp: bp,
}).refine(p => p.payment_bp + p.refund_bp + Math.max(p.yearly_commission_bp, p.other_commission_bp) < 10000,
  { message: 'payment + refund + the larger commission must stay under 10000 bp' })

export type CatalogPolicy = z.infer<typeof policySchema>

export function parsePolicy(value: unknown): CatalogPolicy {
  const parsed = policySchema.safeParse(value)
  if (!parsed.success) throw new Error(`Invalid catalog economics policy: ${z.prettifyError(parsed.error)}`)
  const p = parsed.data
  // Key order fixed, so the dry run and the read-back compare as text.
  return { payment_bp: p.payment_bp, refund_bp: p.refund_bp, yearly_commission_bp: p.yearly_commission_bp,
    other_commission_bp: p.other_commission_bp, margin_bp: p.margin_bp }
}

const PROJECTS = { pnzkiqvktkzznfbyhphe: 'test', irbqamjuazkkyvnnzupf: 'production' } as const

// Only the two known databases (or a local one); production only with --prod.
export function checkPolicyTarget(url: string, prod: boolean): string {
  const host = new URL(url).hostname
  if (host === 'localhost' || host === '127.0.0.1') return 'local'
  const ref = host.endsWith('.supabase.co') ? host.split('.')[0] : ''
  const target = PROJECTS[ref as keyof typeof PROJECTS]
  if (!target) throw new Error(`Unknown database ${host}: refusing to write`)
  if (target === 'production' && !prod) throw new Error('This is the production database: add --prod (only with the Owner\'s go)')
  if (target === 'test' && prod) throw new Error('--prod given but this is the test database')
  return target
}
