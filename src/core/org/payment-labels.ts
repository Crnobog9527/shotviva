// Constants of the receiving-account groups, free of server-only so the admin form (a client
// component) can import them. The SQL side is _org_payment_fields (1660).

export const PAYMENT_KINDS = ['overseas_us', 'mainland_agent'] as const
export type PaymentKind = (typeof PAYMENT_KINDS)[number]

// The same lists the SQL accepts (_org_payment_fields), in display order.
export const PAYMENT_FIELDS: Record<PaymentKind, readonly string[]> = {
  overseas_us: ['account_name', 'bank_name', 'account_number', 'routing_aba', 'swift', 'bank_address', 'beneficiary_address', 'currency', 'notes'],
  mainland_agent: ['account_name', 'bank_name', 'branch', 'account_number', 'swift', 'address', 'currency', 'remittance_note', 'notes'],
}

// Labels in both languages: the admin form shows zh, the owner's package section (E4) picks by locale.
export const PAYMENT_KIND_LABELS: Record<PaymentKind, { zh: string; en: string }> = {
  overseas_us: { zh: '海外美国公司对公账户', en: 'US company business account' },
  mainland_agent: { zh: '中国大陆代收机构账户', en: 'Mainland China collection agent account' },
}
export const PAYMENT_FIELD_LABELS: Record<string, { zh: string; en: string }> = {
  account_name: { zh: '账户名称（收款公司全称）', en: 'Account name' },
  bank_name: { zh: '银行名称', en: 'Bank name' },
  account_number: { zh: '账号 / IBAN', en: 'Account number / IBAN' },
  routing_aba: { zh: 'ABA Routing Number', en: 'ABA routing number' },
  swift: { zh: 'SWIFT / BIC', en: 'SWIFT / BIC' },
  bank_address: { zh: '银行地址', en: 'Bank address' },
  beneficiary_address: { zh: '收款公司地址', en: 'Beneficiary address' },
  branch: { zh: '开户行（支行）', en: 'Bank branch' },
  address: { zh: '地址', en: 'Address' },
  currency: { zh: '币种', en: 'Currency' },
  remittance_note: { zh: '汇款附言要求', en: 'Payment reference' },
  notes: { zh: '备注（企业可见）', en: 'Notes' },
}
