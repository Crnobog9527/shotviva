'use client'

import type { ComponentProps } from 'react'

import { useReveal } from './reveal'

type Props = ({ as: 'li' } & ComponentProps<'li'>) | ({ as?: 'div' } & ComponentProps<'div'>)

// A list item or block that fades up once on entering the viewport (reveal.ts), for server
// components that cannot take the hook themselves.
export function Reveal({ as = 'div', ...props }: Props) {
  const ref = useReveal<HTMLElement>()
  if (as === 'li') return <li ref={ref} {...(props as ComponentProps<'li'>)} />
  return <div ref={ref} {...(props as ComponentProps<'div'>)} />
}
