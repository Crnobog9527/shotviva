import { handleVitals } from '@/core/analytics/vitals/server'

// Public on purpose (AGENTS §6): anonymous speed numbers from the signed-in app pages (Owner
// 2026-11-24: numbers only). It reads no cookie and no session (the proxy matcher skips this
// path), stores no IP, and answers 204 to everything. Abuse is capped by the Vercel Firewall rate
// rules (AGENTS §2), not in code; each request writes at most one small, fully checked row.
export async function POST(request: Request) {
  return handleVitals(request)
}
