'use server'

// Server actions for the auth forms. They live in app/ because they inject site config
// (free credits) into core/auth, which may not import site/ itself.
import {
  loginPath,
  requestPasswordReset,
  resendSignupEmail,
  sendPhoneCode,
  signInWithGoogle,
  signInWithPassword,
  signOut,
  signUpWithPassword,
  updatePassword,
  verifyPhoneCode,
  type FormState,
} from '@/core/auth'
import { saveSignupCode } from '@/core/auth/signup-code-actions'
import { site } from '@/site/site.config'

async function storeSubmittedCode(form: FormData) {
  if (form.has('signupCode')) await saveSignupCode(form.get('signupCode'))
}

export async function loginAction(_: FormState, form: FormData) {
  return signInWithPassword(form, { freeCredits: site.billing.freeCredits, invite: site.growth.invite })
}

export async function googleAction(_: FormState, form: FormData) {
  await storeSubmittedCode(form)
  return signInWithGoogle(form)
}

export async function signupAction(_: FormState, form: FormData) {
  await storeSubmittedCode(form)
  return signUpWithPassword(form)
}

export async function resendSignupAction(_: FormState, form: FormData) {
  return resendSignupEmail(form)
}

// Phone sign-in (T63), Chinese pages only: ask for the SMS code, then enter it.
export async function phoneSendAction(_: FormState, form: FormData) {
  await storeSubmittedCode(form)
  return sendPhoneCode(form)
}

export async function phoneVerifyAction(_: FormState, form: FormData) {
  await storeSubmittedCode(form)
  return verifyPhoneCode(form, { freeCredits: site.billing.freeCredits, invite: site.growth.invite })
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
