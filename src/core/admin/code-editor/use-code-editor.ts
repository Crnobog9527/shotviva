'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useAdminAction } from '../shell/use-admin-action'
import type { ActionValue } from '../templates/types'
import { COPY } from './copy'
import { type Catalog, type Existing, formPatch, offerError } from './model'
import type { ProductId } from '../../config'

export type SaveEditor = (id: string, fields: unknown) => Promise<ActionValue<string>>

export function useCodeEditor(id: string, existing: Existing | null, prices: Catalog, save: SaveEditor) {
  const router = useRouter()
  const { run, pending, error } = useAdminAction()
  const [localError, setLocalError] = useState<string | null>(null)
  function submit(data: FormData) {
    setLocalError(null)
    const starts = data.get('starts'), ends = data.get('ends')
    if (starts && ends && starts >= ends) return setLocalError(COPY.endAfterStart)
    if (!existing && data.has('percent')) {
      const invalid = offerError(prices,Number(data.get('percent')),data.getAll('products') as ProductId[])
      if (invalid) return setLocalError(invalid)
    }
    const fields = formPatch(data,existing)
    const next = (value: string) => router.push('/admin/codes/' + value)
    if (Object.keys(fields).length === 0) return next(id)
    run(() => save(id,fields), next)
  }
  return { submit, pending, error: localError ?? error }
}
