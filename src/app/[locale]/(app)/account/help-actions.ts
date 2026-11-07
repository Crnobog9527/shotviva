'use server'

import { randomUUID } from 'node:crypto'

import { getTranslations } from 'next-intl/server'

import { createAdminSupabase, createServerSupabase, requireApiUser } from '@/core/auth'
import { AppError, toAppError } from '@/core/errors'
import { logger } from '@/core/logger'
import { r2Store } from '@/core/storage'
import {
  addTicketMessage,
  createTicket,
  imageKeysSchema,
  listMyTickets,
  listWorkOptions,
  loadMyThread,
  markTicketSeen,
  showMessages,
  withTicketImages,
  workChoices,
  type Page,
  type ShownThread,
  type TicketSummary,
} from '@/core/support'
import { formError, type Choice, type FormState } from '@/core/support/ui'
import type { Translate } from '@/core/translate'

// Help & feedback in the account page's dialog (ARCHITECTURE §10 「站内工单」「在弹窗里完成」,
// T68). Server actions are public endpoints, so each checks the session itself; the SQL
// functions check ownership and the 5-per-24h limit. Reads run on the user's own session (RLS).

function failed(where: string, error: unknown): FormState {
  const appError = toAppError(error)
  if (appError.code === 'INTERNAL') logger.error(`support.${where}.failed`, { error: appError.cause ?? appError })
  return { error: formError(appError.code) }
}

// The picked images' upload keys (`image` fields, T69); withTicketImages checks they are this
// user's own uploads.
function imageKeys(data: FormData): string[] {
  const parsed = imageKeysSchema.safeParse(data.getAll('image'))
  if (!parsed.success) throw new AppError('INVALID_INPUT', 'too many images')
  return parsed.data
}

// On success the dialog opens the new ticket (no redirect: it never leaves the account page).
// The id is chosen here so the images can be filed under it before the row exists.
export async function createTicketAction(_state: FormState, data: FormData): Promise<FormState> {
  try {
    const user = await requireApiUser()
    const ticketId = randomUUID()
    const target = { uploaderId: user.id, authorId: user.id, ticketId }
    const id = await withTicketImages(r2Store(), target, imageKeys(data), (images) =>
      createTicket(createAdminSupabase(), user.id, Object.fromEntries(data), { ticketId, images }),
    )
    return { error: null, ticketId: id, sentAt: Date.now() }
  } catch (error) {
    return failed('create', error)
  }
}

// The dialog reloads the thread itself after a send, so the account page is not re-rendered.
export async function addMessageAction(ticketId: string, _state: FormState, data: FormData): Promise<FormState> {
  try {
    const user = await requireApiUser()
    const target = { uploaderId: user.id, authorId: user.id, ticketId }
    await withTicketImages(r2Store(), target, imageKeys(data), (images) =>
      addTicketMessage(createAdminSupabase(), user.id, { ticketId, body: data.get('body') }, images),
    )
  } catch (error) {
    return failed('message', error)
  }
  return { error: null, sentAt: Date.now() }
}

export async function loadMyTicketsPage(cursor: string | null): Promise<Page<TicketSummary>> {
  const user = await requireApiUser()
  return listMyTickets(await createServerSupabase(), user.id, cursor)
}

// Opening a ticket clears its dot: read through RLS (someone else's ticket reads as missing) and
// mark it seen in parallel; mark_ticket_seen only touches the author's own ticket.
// Images come back as short-lived signed URLs, only for a thread RLS let this user read.
export async function loadTicketThread(ticketId: string): Promise<ShownThread | null> {
  const user = await requireApiUser()
  const [thread] = await Promise.all([
    loadMyThread(await createServerSupabase(), ticketId),
    markTicketSeen(createAdminSupabase(), user.id, ticketId),
  ])
  return thread && { ...thread, messages: await showMessages(r2Store(), thread.messages) }
}

// The image-issue picker's works, read when the New ticket tab first opens rather than on
// every account page load.
export async function loadWorkChoices(): Promise<Choice[]> {
  const user = await requireApiUser()
  const [works, t] = await Promise.all([listWorkOptions(await createServerSupabase(), user.id), getTranslations('app.support')])
  return workChoices(works, t as unknown as Translate)
}
