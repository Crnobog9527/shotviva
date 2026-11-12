import { AppError } from '../errors'

// getSessionUser() throws this when Auth or the database could not say who is signed in: an
// outage, not a sign-out (ARCHITECTURE §7「会话校验」).
export function isAuthUnavailable(error: unknown): boolean {
  return error instanceof AppError && error.code === 'AUTH_UNAVAILABLE'
}
