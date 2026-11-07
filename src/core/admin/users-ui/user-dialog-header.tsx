'use client'

import { XIcon } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'

import { accountLabel, formatAdminPhone } from '../users/label'
import type { UserDetailData } from '../users/detail-types'
import { USER_TIERS, type UserTier } from '../users/list-types'
import { TierBadge, UserStatus } from './badges'
import { USERS_COPY } from './copy'

const COPY = USERS_COPY.dialog

const asTier = (tier: string | null): UserTier => USER_TIERS.find((known) => known === tier) ?? 'free'

// Who this is, in full (email, phone, id: only admins open this), with the plan and the status
// beside the name. Stays put while the body scrolls.
export function UserDialogHeader({ userId, data }: { userId: string; data: UserDetailData | undefined }) {
  const user = data?.user
  return (
    <header className="flex items-start gap-3 border-b border-border px-4 pt-[max(env(safe-area-inset-top),12px)] pb-3 md:px-6 md:py-4">
      <div className="grid min-w-0 flex-1 gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <DialogPrimitive.Title className="min-w-0 truncate text-lg font-semibold">{user ? accountLabel(user) : USERS_COPY.title}</DialogPrimitive.Title>
          {user ? <TierBadge tier={asTier(data.extras.subscription.tier)} paidUntil={user.paidUntil} className="flex items-center gap-2" /> : null}
          {user ? <UserStatus role={user.role} bannedAt={user.bannedAt} /> : null}
        </div>
        <DialogPrimitive.Description asChild>
          <dl className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
            <Fact term={COPY.email} value={user ? (user.email ?? COPY.none) : '…'} />
            <Fact term={COPY.phone} value={user ? (formatAdminPhone(user.phone) ?? COPY.none) : '…'} />
            <Fact term={COPY.id} value={userId} />
          </dl>
        </DialogPrimitive.Description>
      </div>
      <DialogPrimitive.Close aria-label={COPY.close} className="-mt-1 -mr-2 grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground">
        <XIcon className="size-5" aria-hidden="true" />
      </DialogPrimitive.Close>
    </header>
  )
}

function Fact({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex min-w-0 gap-1.5">
      <dt className="shrink-0">{term}</dt>
      <dd className="min-w-0 font-mono break-all text-foreground select-all">{value}</dd>
    </div>
  )
}
