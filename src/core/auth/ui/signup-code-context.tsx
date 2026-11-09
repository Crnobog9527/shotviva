'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

import { readSignupCode } from '../signup-code-actions'

type CodeDraft = { value: string; edit(value: string): void; edited: boolean }
const Context = createContext<CodeDraft | null>(null)
export const useSignupCodeDraft = () => useContext(Context)

// The signup page supplies its request cookie on first render. The cached homepage reads it
// only when the sheet opens. A slow read cannot overwrite an edit.
export function SignupCodeProvider({ initial, children }: { initial?: string | null; children: ReactNode }) {
  const [cookie, setCookie] = useState(initial ?? '')
  const [edit, setEdit] = useState<string | null>(null)
  useEffect(() => {
    if (initial !== undefined) return
    let active = true
    void readSignupCode().then(code => { if (active) setCookie(code ?? '') }).catch(() => {})
    return () => { active = false }
  }, [initial])
  return <Context.Provider value={{ value: edit ?? cookie, edit: setEdit, edited: edit !== null }}>{children}</Context.Provider>
}

// Every active sign-up form submits its most recent edit alongside the credentials/OTP.
// Untouched fields leave the cookie alone, even while the home sheet is fetching its value.
export function SignupCodeHiddenInput() {
  const draft = useSignupCodeDraft()
  return draft?.edited ? <input type="hidden" name="signupCode" value={draft.value} /> : null
}
