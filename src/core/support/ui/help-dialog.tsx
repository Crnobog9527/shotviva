'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Suspense, useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'

import { ResponsiveSheet } from '../../ui/responsive-sheet'
import type { TicketSummary } from '../types'
import type { HelpActions } from './help-actions'
import { helpParamValue, tabOf, type HelpTab, type HelpView } from './help-param'
import { HelpListView } from './help-list-view'
import { HelpNewView } from './help-new-view'
import { HelpTabs, panelId, tabId } from './help-tabs'
import { HelpThreadView } from './help-thread-view'
import type { Choice } from './form-state'
import { useHelpRoute } from './use-help-route'

type Props = {
  actions: HelpActions
  // The author's own payments, worded on the server (the account page's Purchases read).
  payments: readonly Choice[]
  // The reply time for the user's tier (core/support ReplyTime), rendered on the server.
  replyTime: ReactNode
  brand: string
  // The account page's "new reply" state at load.
  unread: boolean
}

// Help & feedback on the account page (ARCHITECTURE §10 「在弹窗里完成」, T68): a 640px dialog
// from md, a full-height bottom drawer below (DESIGN §8.4). New ticket and My tickets as tabs;
// a ticket opens in place with its messages and the reply field. Where it stands is ?help=…
// (use-help-route), so Back closes it and old /account/help links open it.
// ?help= is read in the browser only (useSearchParams), so the page around it still prerenders.
export function HelpDialog(props: Props) {
  return (
    <Suspense fallback={null}>
      <HelpSheet {...props} />
    </Suspense>
  )
}

function HelpSheet({ actions, payments, replyTime, brand, unread }: Props) {
  const t = useTranslations('app.support')
  const idBase = useId()
  const router = useRouter()
  const { view, job, go, close } = useHelpRoute()
  // What stays on screen while the sheet animates out after ?help= is gone.
  const [shown, setShown] = useState<HelpView>(view ?? { tab: 'new' })
  if (view && helpParamValue(view) !== helpParamValue(shown)) setShown(view)
  const [sentId, setSentId] = useState<string | null>(null)
  // Bumped by every send: My tickets reads its list again even if it were still mounted
  // (Codex on the old pages saw "No tickets yet." until a reload).
  const [listRound, setListRound] = useState(0)
  useRefreshDots(view !== null, unread && shown.tab === 'thread', router.refresh)
  // A new place in the dialog starts at its top: the marker's parent is the sheet's scrolling body.
  const top = useRef<HTMLSpanElement>(null)
  const place = helpParamValue(shown)
  useEffect(() => {
    top.current?.parentElement?.scrollTo({ top: 0 })
  }, [place])

  const onSent = useCallback(
    (id: string) => {
      setSentId(id)
      setListRound((round) => round + 1)
      go({ tab: 'thread', id })
    },
    [go],
  )
  const onOpen = useCallback((ticket: TicketSummary) => go({ tab: 'thread', id: ticket.id }), [go])
  const tab = tabOf(shown)
  const panel = (name: HelpTab, children: ReactNode) => (
    <div role="tabpanel" id={panelId(idBase, name)} aria-labelledby={tabId(idBase, name)} hidden={tab !== name}>
      {children}
    </div>
  )
  return (
    <ResponsiveSheet tall open={view !== null} onOpenChange={(open) => !open && close()} title={t('title')} description={replyTime}>
      <span ref={top} hidden />
      <HelpTabs current={tab} onChange={(next) => go({ tab: next })} idBase={idBase} />
      {panel('new', <HelpNewView actions={actions} payments={payments} job={job} onSent={onSent} />)}
      {panel(
        'list',
        shown.tab === 'thread' ? (
          <HelpThreadView
            key={shown.id}
            id={shown.id}
            actions={actions}
            brand={brand}
            notice={shown.id === sentId ? <SentNotice replyTime={replyTime} /> : null}
            onBack={() => go({ tab: 'list' })}
          />
        ) : tab === 'list' ? (
          <HelpListView key={listRound} load={actions.loadTickets} onOpen={onOpen} onNew={() => go({ tab: 'new' })} />
        ) : null,
      )}
    </ResponsiveSheet>
  )
}

// The page's "new reply" dots (the Support row, the Account tab) are server-rendered once per
// load (§5.1 rule 8). Once a ticket was opened here while one was showing, closing the dialog
// re-renders the page so they match what was read.
function useRefreshDots(open: boolean, readWhileDot: boolean, refresh: () => void) {
  const stale = useRef(false)
  useEffect(() => {
    if (readWhileDot) stale.current = true
  }, [readWhileDot])
  useEffect(() => {
    if (open || !stale.current) return
    stale.current = false
    refresh()
  }, [open, refresh])
}

function SentNotice({ replyTime }: { replyTime: ReactNode }) {
  const t = useTranslations('app.support.thread')
  return (
    <p role="status" className="hairline-lit rounded-panel bg-card p-4 text-body">
      {t('sent')} {replyTime}
    </p>
  )
}
