import { connection } from 'next/server'

import { versionResponse } from '@/core/app-update/server'

// Public on purpose (AGENTS §6): the build version is not a secret and an open tab asks for it
// while signed out too. No database, no session (the proxy matcher skips this path), never
// cached, so each answer comes from the deployment serving the request (T90).
export async function GET() {
  // Never prerender: a prerendered answer could be served from a cache.
  await connection()
  return versionResponse()
}
