'use server'

// Server actions for the auth forms. They live in app/ because they inject site config
// (free credits) into core/auth, which may not import site/ itself.
import {
  requestPasswordReset,
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

export async function resetRequestAction(_: FormState, form: FormData) {
  return requestPasswordReset(form)
}

export async function updatePasswordAction(_: FormState, form: FormData) {
  return updatePassword(form)
}

export async function signOutAction() {
  return signOut()
}
