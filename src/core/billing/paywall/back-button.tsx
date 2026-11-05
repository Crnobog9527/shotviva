"use client"

import { useTranslations } from "next-intl"

export function BackButton({ onClick }: { onClick(): void }) {
  const t = useTranslations("paywall")
  return (
    <button type="button" onClick={onClick} className="mt-2 -ml-1 inline-flex min-h-11 items-center gap-1 px-1 text-caption text-bone-dim">
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 6l-6 6 6 6" />
      </svg>
      {t("back")}
    </button>
  )
}
