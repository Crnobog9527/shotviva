'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import type { ActionValue } from '../templates/types'
import type { UserDetailData } from '../users/detail-types'

export type UserDetailLoader = (input: { userId: string; jobId: string | null; cursor: string | null }) => Promise<ActionValue<UserDetailData | null>>

type State = { data: UserDetailData | undefined; missing: boolean; failed: string | null }

const FALLBACK = '读取失败，请稍后重试'

// The dialog's data, read through a server action when it opens, again after an action changed
// the user (reload) and for another ledger page. What was read stays on screen while the next
// read runs, so adjusting credits never blanks the dialog. Mounted per user (keyed by id).
// The loader sits in a ref: a page refresh hands the layout new action references, which must
// not trigger another read.
export function useUserDetail(userId: string, jobId: string | null, load: UserDetailLoader) {
  const loader = useRef(load)
  useEffect(() => {
    loader.current = load
  }, [load])
  const [cursor, setCursor] = useState<string | null>(null)
  const [round, setRound] = useState(0)
  const [state, setState] = useState<State>({ data: undefined, missing: false, failed: null })
  useEffect(() => {
    let live = true
    loader.current({ userId, jobId, cursor }).then(
      (result) => {
        if (!live) return
        if (!result.ok) setState((current) => ({ ...current, failed: result.message || FALLBACK }))
        else if (result.value === null) setState({ data: undefined, missing: true, failed: null })
        else setState({ data: result.value, missing: false, failed: null })
      },
      () => {
        if (live) setState((current) => ({ ...current, failed: FALLBACK }))
      },
    )
    return () => {
      live = false
    }
  }, [userId, jobId, cursor, round])
  const reload = useCallback(() => setRound((value) => value + 1), [])
  return { ...state, reload, setCursor }
}
