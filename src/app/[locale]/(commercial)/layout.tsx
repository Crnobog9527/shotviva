import '../../globals-public.css'
import './pilot-marketing.css'

import type { ReactNode } from 'react'

import { MarketingShell } from '../marketing-shell'
import { CommercialLaterStyles } from './later-styles'

export default function CommercialLayout({ children }: { children: ReactNode }) {
  return <MarketingShell><CommercialLaterStyles />{children}</MarketingShell>
}
