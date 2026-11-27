import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }))

import { APP_SHELL_SWITCH_COPY, SERVICE_WORKER_SWITCH_COPY } from './service-worker-card'
import { SettingSwitchCard, type SettingSwitchCardProps } from './setting-switch-card'
import type { SwitchCopy } from './switch-copy'

const off = { enabled: false, updatedAt: null, updatedByEmail: null }
const on = { enabled: true, updatedAt: '2026-11-27T02:00:00Z', updatedByEmail: 'owner@example.com' }
const save = async () => ({ ok: true as const })
const render = (props: Omit<SettingSwitchCardProps, 'save'>) => renderToStaticMarkup(createElement(SettingSwitchCard, { ...props, save }))
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('unified switch card', () => {
  it('leads with the purpose and what on and off do; the long text and key fold away', () => {
    const html = render({ copy: SERVICE_WORKER_SWITCH_COPY, value: on })
    const summary = SERVICE_WORKER_SWITCH_COPY.summary!
    const folded = html.slice(html.indexOf('<details'))
    expect(html.indexOf(summary.purpose)).toBeLessThan(html.indexOf('<details'))
    expect(text(html)).toContain(`开着 ${summary.whenOn}`)
    expect(text(html)).toContain(`关着 ${summary.whenOff}`)
    expect(text(html)).toContain('紧急开关')
    expect(folded).toContain(SERVICE_WORKER_SWITCH_COPY.body)
    expect(folded).toContain('service_worker_enabled')
    expect(html).toContain('id="service_worker_enabled"')
  })

  it('warns when the switch it depends on is off, and only names it when on', () => {
    const dependency = { label: '需要「手机离线缓存」开着', unmet: '手机离线缓存关着，这个开关现在不生效' }
    expect(render({ copy: APP_SHELL_SWITCH_COPY, value: on, dependency: { ...dependency, met: false } })).toContain(dependency.unmet)
    const met = render({ copy: APP_SHELL_SWITCH_COPY, value: on, dependency: { ...dependency, met: true } })
    expect(met).toContain(dependency.label)
    expect(met).not.toContain(dependency.unmet)
  })

  it('a card without a summary keeps its key and full text up front', () => {
    const plain: SwitchCopy = { ...SERVICE_WORKER_SWITCH_COPY, summary: undefined }
    const html = render({ copy: plain, value: off })
    expect(html).not.toContain('<details')
    expect(html).toContain(plain.body)
    expect(html).not.toContain('紧急开关')
  })
})
