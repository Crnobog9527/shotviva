'use client'

import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import type { FormState } from '../flows/form-state'

export function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mx-auto flex w-full max-w-sm flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {children}
    </section>
  )
}

type FieldProps = { name: string; label: string; type: 'email' | 'password'; autoComplete: string; minLength?: number }

// 16px inputs stop iOS from zooming on focus (DESIGN §8.5).
export function Field({ name, label, type, autoComplete, minLength }: FieldProps) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium">
      {label}
      <input
        name={name}
        type={type}
        required
        minLength={minLength}
        autoComplete={autoComplete}
        className="h-12 rounded-md border border-input px-3 text-base font-normal"
      />
    </label>
  )
}

export function SubmitButton({ pending, children }: { pending: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-12 w-full rounded-md bg-primary text-base font-semibold text-primary-foreground disabled:opacity-60"
    >
      {children}
    </button>
  )
}

type CaptchaSlotProps = { mode: string; mount: (element: HTMLDivElement | null) => void; needsTick: boolean }

export function CaptchaSlot({ mode, mount, needsTick }: CaptchaSlotProps) {
  const t = useTranslations('auth')
  if (mode !== 'checkbox') return null
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">{t(needsTick ? 'captcha.tick' : 'captcha.fallback')}</p>
      <div ref={mount} />
    </div>
  )
}

export function FormMessage({ state, sentKey }: { state: FormState; sentKey?: string }) {
  const t = useTranslations('auth')
  if (state.status === 'idle') return null
  const text = state.status === 'sent' ? (sentKey ? t(sentKey) : null) : t(`errors.${state.code}`)
  if (!text) return null
  return (
    <p role={state.status === 'error' ? 'alert' : 'status'} className="text-sm">
      {text}
    </p>
  )
}
