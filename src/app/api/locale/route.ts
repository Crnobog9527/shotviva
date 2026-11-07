import type { NextRequest } from 'next/server'

import { errorResponse } from '@/core/api-response'
import { handleAccountLocale } from '@/core/auth'

// The language switches' beacon (ARCHITECTURE §17): stores a signed-in account's choice.
export async function POST(request: NextRequest) {
  try {
    return await handleAccountLocale(request)
  } catch (error) {
    return errorResponse(error, 'locale')
  }
}
