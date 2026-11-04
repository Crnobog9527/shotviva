// Single source of error codes. User-facing copy lives in the UI layer, not here,
// so log messages and what the user sees can evolve independently.
export const ERROR_CODES = [
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'INVALID_INPUT',
  'CREDITS_INSUFFICIENT',
  'INTERNAL',
] as const

export type ErrorCode = (typeof ERROR_CODES)[number]

const HTTP_STATUS: Record<ErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID_INPUT: 422,
  CREDITS_INSUFFICIENT: 402,
  INTERNAL: 500,
}

export type ErrorBody = { code: ErrorCode; message: string }

export class AppError extends Error {
  readonly code: ErrorCode

  constructor(code: ErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'AppError'
    this.code = code
  }

  get status(): number {
    return HTTP_STATUS[this.code]
  }

  toBody(): ErrorBody {
    return { code: this.code, message: this.message }
  }
}

// Unknown throwables become INTERNAL so internal details never leak to clients.
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error
  return new AppError('INTERNAL', 'Something went wrong', { cause: error })
}
