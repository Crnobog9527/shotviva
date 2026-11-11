// Accounts the gallery's counts leave out (ARCHITECTURE §16.2, T108): admins, and the QA personas
// (qa-*@ the site's own domain, scripts/qa/personas.ts).
export function isStaffAccount(user: { role: string; email: string | null }, domain: string): boolean {
  if (user.role === 'admin') return true
  const email = user.email?.toLowerCase() ?? ''
  return /^qa-[a-z0-9-]+@/.test(email) && email.endsWith(`@${domain.toLowerCase()}`)
}
