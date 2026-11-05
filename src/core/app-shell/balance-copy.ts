import type { Balance } from '../billing/pools'
import type { Translate } from '../translate'

// Balance wording (DESIGN §4.3, "The Credits Unit Rule"): always credits, paid and free shown
// apart. Inside the app the gift is "6 free credits", never "3 free Standard images".
// This picks the message; the words live in site/messages (app.balance), `t` is scoped there.

// Short form for the chip in the top bar: "6 free", "30 credits", "30 + 6 free".
export function balanceChipLabel({ paid, free }: Balance, t: Translate): string {
  if (paid > 0 && free > 0) return t('chipBoth', { paid, free })
  if (free > 0) return t('chipFree', { free })
  return t('chipPaid', { count: paid })
}

// Full sentence: "You have 6 free credits." / "You have 30 credits and 6 free credits."
export function balanceSentence({ paid, free }: Balance, t: Translate): string {
  if (paid === 0 && free === 0) return t('none')
  if (paid > 0 && free > 0) return t('both', { paid, free })
  return free > 0 ? t('free', { free }) : t('paid', { paid })
}
