import { connection } from 'next/server'

import { pricingV2, publicEnv } from '@/core/public-env'

// Public build metadata used to check an immutable candidate against its target database.
export async function GET() {
  await connection()
  return Response.json({
    version: pricingV2 ? 'v2' : 'v1',
    databaseHost: new URL(publicEnv.NEXT_PUBLIC_SUPABASE_URL).host,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
