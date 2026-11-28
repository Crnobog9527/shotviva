import { errorResponse, jsonResponse } from '@/core/api-response'
import { requireApiUser } from '@/core/auth'
import { readMemberStanding } from '@/core/billing/standing'

// GET → { standing }: what the caller already holds (T66), for the plans on a static public page
// (/pricing asks once the browser finds a session cookie: core/billing/paywall/standing-fetch.tsx).
// Signed-in and verified only, the caller's own standing only, never cached. It only decides how
// the plan buttons read; checkout checks again on the server (409).
export async function GET() {
  try {
    const user = await requireApiUser()
    return jsonResponse({ standing: await readMemberStanding(user.id) })
  } catch (error) {
    return errorResponse(error, 'account-standing')
  }
}
