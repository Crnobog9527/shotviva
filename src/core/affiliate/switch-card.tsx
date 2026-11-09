'use client'

import { useActionState } from 'react'
import { switchCopy } from './switch-copy'

export function AffiliateSwitchCard({ enabled, save }: {
  enabled: boolean
  save: (value: boolean) => Promise<boolean>
}) {
  const [failed, submit, pending] = useActionState(async () => !(await save(!enabled)), false)
  return (
    <form action={submit} className="my-6 grid justify-items-start gap-3 rounded-lg border p-4">
      <h2 className="font-medium">{switchCopy.heading}</h2>
      <button disabled={pending} className="rounded-md border px-3 py-2">{enabled ? switchCopy.disable : switchCopy.enable}</button>
      {failed && <p role="alert">{switchCopy.failed}</p>}
    </form>
  )
}
