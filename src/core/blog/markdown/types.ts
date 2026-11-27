// The Markdown the blog accepts, parsed into a small tree and drawn by React (render.tsx).
// There is no HTML in or out: raw tags in the source stay plain text, so nothing the author
// pastes can become markup, a script or an attribute.

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'code'; v: string }
  | { t: 'strong' | 'em'; c: Inline[] }
  | { t: 'link'; href: string; c: Inline[] }
  | { t: 'image'; src: string; alt: string }

export type ListItem = { c: Inline[]; children: Block[] }
export type Align = 'left' | 'center' | 'right' | null

export type Block =
  | { t: 'heading'; level: 2 | 3 | 4; id: string; c: Inline[] }
  | { t: 'p'; c: Inline[] }
  | { t: 'list'; ordered: boolean; items: ListItem[] }
  | { t: 'quote'; c: Block[] }
  | { t: 'code'; lang: string; v: string }
  | { t: 'hr' }
  | { t: 'table'; align: Align[]; head: Inline[][]; rows: Inline[][][] }

export type Hit<T> = { node: T; end: number } | null
export type TocEntry = { id: string; text: string; level: 2 | 3 }
