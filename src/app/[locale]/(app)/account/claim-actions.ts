'use server'

import { refresh } from 'next/cache'

import { claimWithGoogle, sendClaimPhoneCode, verifyClaimPhoneCode, type ClaimState } from '@/core/auth'

// 1480: the account page's 「领取注册赠分」. A claim changes the balance, so the page reads again.
function refreshOnClaim(state: ClaimState): ClaimState {
  if (state.status === 'claimed') refresh()
  return state
}

export async function claimPhoneSendAction(_: ClaimState, form: FormData): Promise<ClaimState> {
  return sendClaimPhoneCode(form)
}

export async function claimPhoneVerifyAction(_: ClaimState, form: FormData): Promise<ClaimState> {
  return refreshOnClaim(await verifyClaimPhoneCode(form))
}

export async function claimGoogleAction(): Promise<ClaimState> {
  return refreshOnClaim(await claimWithGoogle())
}
