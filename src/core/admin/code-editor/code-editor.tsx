'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Button } from '../../ui/button'
import { ConditionFields } from './condition-fields'
import { COPY } from './copy'
import { DiscountFields } from './discount-fields'
import { GiftFields, IdentityFields } from './identity-fields'
import { type Catalog, type Existing, type Policy, type Preset, emptyCode, giftChanged, offerError, originalPreset } from './model'
import { useCodeEditor, type SaveEditor } from './use-code-editor'

type Props = { id: string; existing: Existing | null; prices: Catalog; policy: Policy; save: SaveEditor }

function useGiftFields(code: Existing, policy: Policy) {
  const [pool,setPool] = useState(code.invitee_pool ?? 'free')
  const [credits,setCredits] = useState(String(code.invitee_credits ?? ''))
  const [quota,setQuota] = useState(String(code.max_redemptions ?? ''))
  const changed = giftChanged(code,credits,pool,quota)
  return { gift: { pool,setPool,credits,setCredits,changed,policy }, quota,setQuota,
    needsCap: pool === 'paid' && policy.requirePaidGiftCap && changed }
}

function useOffer(code: Existing, prices: Catalog, locked: boolean) {
  const [percent,setPercent] = useState(String(code.discount_percent ?? ''))
  const [chosen,setChosen] = useState(code.discount_products ?? [])
  const error = locked || !percent ? null : offerError(prices,Number(percent),chosen)
  return { prices,code,locked,percent,setPercent,chosen,setChosen,error }
}

export function CodeEditor({ id, existing, prices, policy, save }: Props) {
  const code = existing ?? emptyCode
  const [preset,setPreset] = useState<Preset>(existing ? originalPreset(existing) : 'promo')
  const { gift,quota,setQuota,needsCap } = useGiftFields(code,policy)
  const offer = useOffer(code,prices,!!existing)
  const { submit, pending, error } = useCodeEditor(id,existing,prices,save)
  return <form className="w-full max-w-3xl text-sm" onSubmit={e => {
    e.preventDefault()
    submit(new FormData(e.currentTarget))
  }}><fieldset className="grid gap-5" disabled={pending}>
    <IdentityFields code={code} editing={!!existing} preset={preset} change={setPreset}>
      {preset !== 'promo' && <GiftFields {...gift} />}
    </IdentityFields>
    {preset !== 'gift' && <DiscountFields {...offer} />}
    <ConditionFields code={code} quota={quota} setQuota={setQuota} needsCap={preset !== 'promo' && needsCap} />
    {error && <p role="alert" className="text-destructive">{error}</p>}
    <div className="flex items-center gap-4"><Button type="submit" disabled={preset !== 'gift' && !!offer.error}>{pending ? COPY.busy : COPY.save}</Button>
      <Link className="underline" href={existing ? '/admin/codes/'+id : '/admin/codes'}>{COPY.cancel}</Link></div>
  </fieldset></form>
}
