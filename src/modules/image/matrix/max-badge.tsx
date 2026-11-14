import { TierBadge } from '../gated/tier-badge'

// The mark on a Max feature (T107): Max in its gold, with a drawn lock while the account is
// below Max. The same badge every tier-gated feature on the Create page carries.
export function MaxBadge({ locked, className }: { locked: boolean; className?: string }) {
  return <TierBadge tier="max" locked={locked} className={className} />
}
