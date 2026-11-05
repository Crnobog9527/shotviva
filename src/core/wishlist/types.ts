// Wishlist data as the app sees it (ARCHITECTURE §15.3). Database rows stay snake_case
// inside this folder; everything exported is camelCase.

export const REQUEST_STATUSES = ['pending', 'live', 'shipped', 'rejected'] as const
export type RequestStatus = (typeof REQUEST_STATUSES)[number]

// The Owner's moves on the review page (§15.1): approve and ship go forward, reject covers
// both "reject a pending request" and "take a live one down".
export type ReviewAction = 'approve' | 'reject' | 'ship'

export type RequestRow = {
  id: string
  user_id: string
  description: string
  image_keys: string[]
  status: RequestStatus
  template_id: string | null
  votes_count: number
  author_label: string
  created_at: string
  reviewed_at: string | null
}

// One card on the wall: live or shipped only, never the author's identity beyond the label.
export type WallCard = {
  id: string
  description: string
  authorLabel: string
  status: 'live' | 'shipped'
  votesCount: number
  voted: boolean
  // Set on shipped cards: "Shipped →" opens this template's workspace.
  template: { id: string; name: string } | null
  imageUrls: string[]
  createdAt: string
}

// One row of "My requests". Rejected ones have no images left and never show a reason.
export type MyRequest = {
  id: string
  description: string
  status: RequestStatus
  votesCount: number
  templateId: string | null
  imageUrls: string[]
  createdAt: string
}

// The review page reads at most this many of each status (admin_list_template_requests).
export const ADMIN_LIST_CAP = 500

export type AdminRequest = {
  id: string
  email: string | null
  description: string
  status: RequestStatus
  templateId: string | null
  votesCount: number
  imageUrls: string[]
  createdAt: string
}

export type VoteResult = { voted: boolean; votesCount: number }

// A keyset page (AGENTS §5.1 rule 4); nextCursor is null on the last page.
export type Page<T> = { items: T[]; nextCursor: string | null }
