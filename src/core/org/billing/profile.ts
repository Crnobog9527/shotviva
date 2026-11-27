import 'server-only'

import { z } from 'zod'

import { callRpc, type RpcClient } from '../../billing/rpc'

// 开票信息 (ARCHITECTURE §6.5, migrations 1960–1961): the company legal name and tax ID that
// Waffo prints on the invoice when the org's primary admin buys on Shotviva. Only the org's
// CURRENT owner reads or edits it; `owner` is always the signed-in account's id from the server
// session. The SQL functions check ownership again and validate every field themselves.

// Mainland China's 统一社会信用代码: 18 characters, no I, O, S, V or Z.
export const CN_TAX_ID = /^[0-9A-HJ-NPQRTUWXY]{2}[0-9]{6}[0-9A-HJ-NPQRTUWXY]{10}$/
const OTHER_TAX_ID = /^[0-9A-Z][0-9A-Z./-]{2,39}$/
// The places the form offers (the SQL function holds the same list). Waffo needs a state code
// (CA, NY, NSW, ON) for the US, Canada and Australia.
export const BILLING_COUNTRIES = ['CN', 'HK', 'MO', 'TW', 'SG', 'MY', 'JP', 'KR', 'US', 'GB', 'AU', 'CA', 'DE', 'FR'] as const
export const STATE_CODE_COUNTRIES: readonly string[] = ['US', 'CA', 'AU']
const STATE_CODE = /^[A-Z]{2,3}$/
const NO_CONTROL = /^[^\p{Cc}]*$/u

const blankToNull = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? null : value)
const optional = <T extends z.ZodType>(schema: T) => z.preprocess(blankToNull, schema.nullable().optional())

export const billingProfileInput = z
  .object({
    legalName: z.string().transform((s) => s.trim().replace(/\s+/g, ' ')).pipe(z.string().min(2).max(200).regex(NO_CONTROL)),
    taxId: z.string().transform((s) => s.replace(/\s/g, '').toUpperCase()),
    country: z.string().trim().toUpperCase().pipe(z.enum(BILLING_COUNTRIES)).default('CN'),
    postcode: optional(z.string().trim().regex(/^[0-9A-Za-z][0-9A-Za-z -]{0,15}$/)),
    state: optional(z.string().trim().min(1).max(80).regex(NO_CONTROL)),
    invoiceEmail: optional(z.string().trim().toLowerCase().max(254).pipe(z.email())),
  })
  .refine((p) => (p.country === 'CN' ? CN_TAX_ID : OTHER_TAX_ID).test(p.taxId), { path: ['taxId'] })
  .refine((p) => !STATE_CODE_COUNTRIES.includes(p.country) || STATE_CODE.test((p.state ?? '').toUpperCase()), { path: ['state'] })
  .transform((p) => (STATE_CODE_COUNTRIES.includes(p.country) ? { ...p, state: p.state?.toUpperCase() } : p))

export type BillingProfileInput = z.input<typeof billingProfileInput>

const profileRow = z.object({
  legal_name: z.string(),
  tax_id: z.string(),
  country: z.string(),
  postcode: z.string().nullable(),
  state: z.string().nullable(),
  invoice_email: z.string().nullable(),
  updated_at: z.string(),
})

export type BillingProfile = {
  legalName: string
  taxId: string
  country: string
  postcode: string | null
  state: string | null
  invoiceEmail: string | null
  updatedAt: string
}

export function toBillingProfile(row: z.infer<typeof profileRow>): BillingProfile {
  return {
    legalName: row.legal_name,
    taxId: row.tax_id,
    country: row.country,
    postcode: row.postcode,
    state: row.state,
    invoiceEmail: row.invoice_email,
    updatedAt: row.updated_at,
  }
}

const maybeProfile = profileRow.nullable().transform((row) => (row ? toBillingProfile(row) : null))
const uuid = z.uuid()

export async function getBillingProfile(client: RpcClient, owner: string): Promise<BillingProfile | null> {
  return callRpc(client, 'org_billing_profile_get', { p_owner: uuid.parse(owner) }, maybeProfile)
}

export async function saveBillingProfile(client: RpcClient, owner: string, input: unknown): Promise<BillingProfile> {
  const p = billingProfileInput.parse(input)
  const args = {
    p_owner: uuid.parse(owner),
    p_legal_name: p.legalName,
    p_tax_id: p.taxId,
    p_country: p.country,
    p_postcode: p.postcode ?? null,
    p_state: p.state ?? null,
    p_invoice_email: p.invoiceEmail ?? null,
  }
  return callRpc(client, 'org_billing_profile_save', args, profileRow.transform(toBillingProfile))
}

export async function clearBillingProfile(client: RpcClient, owner: string): Promise<boolean> {
  return callRpc(client, 'org_billing_profile_clear', { p_owner: uuid.parse(owner) }, z.boolean())
}

// The checkout's read: the buyer's org profile when the buyer is its current owner, else null.
export async function checkoutBillingProfile(client: RpcClient, user: string): Promise<BillingProfile | null> {
  return callRpc(client, 'org_checkout_billing_profile', { p_user: uuid.parse(user) }, maybeProfile)
}
