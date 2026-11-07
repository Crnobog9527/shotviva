"use client"

import { useTranslations } from "next-intl"

import { Link } from "../../i18n/ui"
import { buttonVariants } from "../../ui/button"
import { cn } from "../../ui/cn"
import type { CheckoutStatus } from "./use-checkout"

// The button follows the pick (comps-v3-b paywall.html): safelight for Pro, gold foil for Max,
// bone for Starter and the packs.
export type CheckoutTone = "primary" | "gold" | "bone"

// `locked`: the pick is the member's own plan or a lower one (T66); the button stays put but
// cannot be pressed, and the fine print says why. `note`: what an upgrade does, on its own line.
type Props = { label: string; fine: string; note: string | null; tone: CheckoutTone; status: CheckoutStatus; locked: string | null; onClick(): void }

// The sheet's footer, outside its scroll area so it never moves: the one primary and its fine
// print. Stacked on phones; from md the fine print sits left and the button right.
export function CheckoutBar({ label, fine, note, tone, status, locked, onClick }: Props) {
  const t = useTranslations("paywall")
  const pending = status === "pending"
  return (
    <div className="flex-none bg-popover px-4 pt-3 pb-[calc(var(--sab)+8px)] shadow-[inset_0_1px_0_var(--border)] md:grid md:grid-cols-[1fr_auto] md:items-center md:gap-x-6 md:rounded-b-panel md:px-7 md:pb-4">
      <button
        type="button"
        onClick={onClick}
        disabled={pending || locked !== null}
        aria-busy={pending}
        className={buttonVariants({
          variant: tone === "primary" ? "cta" : "cta-neutral",
          size: "cta",
          className: cn("md:col-start-2 md:row-start-1 md:w-auto md:min-w-80", tone === "gold" && "bg-[image:var(--chrome)] text-[var(--tier-max-ink)]"),
        })}
      >
        {pending ? t("redirecting") : label}
      </button>
      <p className="mt-2 text-center text-caption leading-[1.4] text-muted-foreground md:col-start-1 md:row-start-1 md:mt-0 md:text-left" aria-live="polite">
        {locked ? <span className="text-foreground">{locked}</span> : <FineLine status={status} fine={fine} />}
        {note && !locked && status !== "refused" ? <span className="mt-0.5 block text-bone-dim">{note}</span> : null}
      </p>
    </div>
  )
}

// The fine print, or what went wrong: a failed start, or the server refusing a plan that is
// not higher than the one held, with the way to manage it.
function FineLine({ status, fine }: { status: CheckoutStatus; fine: string }) {
  const t = useTranslations("paywall")
  if (status === "error") return <span className="text-destructive">{t("error")}</span>
  if (status !== "refused") return <>{fine}</>
  return (
    <span className="text-foreground">
      {t("downgradeRefused")}{" "}
      <Link href="/account" className="font-medium text-primary underline underline-offset-3">
        {t("goToAccount")}
      </Link>
    </span>
  )
}
