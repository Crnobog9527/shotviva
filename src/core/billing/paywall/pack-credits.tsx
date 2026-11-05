"use client"

import { useTranslations } from "next-intl"

// "115 credits" with the number in the display face and the word small beside it.
export function PackCredits({ count }: { count: number }) {
  const t = useTranslations("paywall")
  return (
    <span className="block leading-none">
      {t.rich("packCredits", {
        count,
        n: (chunks) => <span className="font-display text-[28px]">{chunks}</span>,
        u: (chunks) => <span className="text-caption text-muted-foreground">{chunks}</span>,
      })}
    </span>
  )
}
