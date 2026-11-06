'use server'

// Server actions for the auth forms. They live in app/ because they inject site config
// (free credits) into core/auth, which may not import site/ itself.
import {
  loginPath,
  requestPasswordReset,
  resendSignupEmail,
  signInWithGoogle,
  signInWithPassword,
  signOut,
  signUpWithPassword,
  updatePassword,
  type FormState,
} from '@/core/auth'
import { site } from '@/site/site.config'

export async function loginAction(_: FormState, form: FormData) {
  return signInWithPassword(form, { freeCredits: site.billing.freeCredits })
}

export async function googleAction(_: FormState, form: FormData) {
  return signInWithGoogle(form)
}

export async function signupAction(_: FormState, form: FormData) {
  return signUpWithPassword(form)
}

export async function resendSignupAction(_: FormState, form: FormData) {
  return resendSignupEmail(form)
}

export async function resetRequestAction(_: FormState, form: FormData) {
  return requestPasswordReset(form)
}

export async function updatePasswordAction(_: FormState, form: FormData) {
  return updatePassword(form)
}

export async function signOutAction() {
  return signOut()
}

// "Not you? Log in with a different account" on /connect/graylum: sign out, then the login page
// on the way back to the same connect page. `next` is bound by the page but still arrives from
// the browser, so signOut sanitises it.
export async function switchAccountAction(next: string) {
  return signOut(loginPath(next))
}
