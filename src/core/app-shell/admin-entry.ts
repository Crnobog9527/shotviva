// The way into /admin for admins only (ARCHITECTURE §10, spec #186). The server builds it
// only when profiles.role = 'admin' and hands it to the tab bar, so a normal user's props and
// HTML never carry it. It is not the access control: /admin checks the role itself.
export type AdminEntry = { href: '/admin'; label: string }

// `label` is only called for an admin, so nobody else's render even translates it.
export function adminEntryFor(role: string | null | undefined, label: () => string): AdminEntry | undefined {
  return role === 'admin' ? { href: '/admin', label: label() } : undefined
}
