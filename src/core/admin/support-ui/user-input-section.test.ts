import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { UserInputSection } from './user-input-section'

const render = (input: Parameters<typeof UserInputSection>[0]['input']) => renderToStaticMarkup(createElement(UserInputSection, { input }))

describe('UserInputSection', () => {
  it('labels each entry and shows the text as plain text, never as markup', () => {
    const html = render({
      isEdit: true,
      entries: [
        { kind: 'instruction', label: null, value: '<img src=x onerror=alert(1)> make it blue' },
        { kind: 'copy', label: '菜名', value: 'Fake noodles' },
        { kind: 'note', label: null, value: 'fake note' },
      ],
      options: [{ label: '升级摆盘', on: true }],
    })
    expect(html).toContain('编辑说明')
    expect(html).toContain('菜名')
    expect(html).toContain('补充说明')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt; make it blue')
    expect(html).not.toContain('<img')
    expect(html).toContain('升级摆盘 开')
  })

  it('says so when nothing was recorded', () => {
    expect(render({ isEdit: false, entries: [], options: [] })).toContain('没有记录到用户输入')
  })
})
