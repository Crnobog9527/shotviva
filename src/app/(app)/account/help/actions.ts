'use server'

import { refresh } from 'next/cache'
import { redirect } from 'next/navigation'

import { createAdminSupabase, createServerSupabase, requireApiUser } from '@/core/auth'
import { toAppError } from '@/core/errors'
import { logger } from '@/core/logger'
import { addTicketMessage, createTicket, listMyTickets, type Page, type TicketSummary } from '@/core/support'
import { formError, type FormState } from '@/core/support/ui'

// Help & feedback (ARCHITECTURE §10 「站内工单」). Server actions are public endpoints, so each
// checks the session itself; the SQL functions check ownership and the 5-per-24h limit.

function failed(where: string, error: unknown): FormState {
  const appError = toAppError(error)
  if (appError.code === 'INTERNAL') logger.error(`support.${where}.failed`, { error: appError.cause ?? appError })
  return { error: formError(appError.code) }
}

export async function createTicketAction(_state: FormState, data: FormData): Promise<FormState> {
  let id: string
  try {
    const user = await requireApiUser()
    id = await createTicket(createAdminSupabase(), user.id, Object.fromEntries(data))
  } catch (error) {
    return failed('create', error)
  }
  // Outside the try: redirect() works by throwing.
  redirect(`/account/help/${id}?sent=1`)
}

export async function addMessageAction(ticketId: string, _state: FormState, data: FormData): Promise<FormState> {
  try {
    const user = await requireApiUser()
    await addTicketMessage(createAdminSupabase(), user.id, { ticketId, body: data.get('body') })
  } catch (error) {
    return failed('message', error)
  }
  refresh()
  return { error: null, sentAt: Date.now() }
}

export async function loadMyTicketsPage(cursor: string): Promise<Page<TicketSummary>> {
  const user = await requireApiUser()
  return listMyTickets(await createServerSupabase(), user.id, cursor)
}
