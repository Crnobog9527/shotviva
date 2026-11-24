// How an account is named in the admin (T63): its email, else its phone, else its id. A phone
// sign-up may have no email at all. Admins see the whole number, grouped: +86 140 0000 5678.

export function formatAdminPhone(phone: string | null | undefined): string | null {
  if (!phone) return null
  const digits = phone.replace(/^\+/, '')
  const mainland = digits.match(/^86(\d{3})(\d{4})(\d{4})$/)
  return mainland ? `+86 ${mainland[1]} ${mainland[2]} ${mainland[3]}` : `+${digits}`
}

export function accountLabel(account: { id: string; email: string | null; phone?: string | null }): string {
  return account.email || formatAdminPhone(account.phone) || account.id
}

// Email, else phone, else null: for places that show the id themselves when nobody is named.
// Auth gives "" (not null) for a phone sign-up's email, so this tests for empty, not null.
export function accountContact(account: { email?: string | null; phone?: string | null }): string | null {
  return account.email || formatAdminPhone(account.phone) || null
}
