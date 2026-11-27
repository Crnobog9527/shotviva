import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { parseMarkdown } from '../markdown'
import { BlocksView } from './markdown-view'

const html = (md: string) => renderToStaticMarkup(createElement(BlocksView, { blocks: parseMarkdown(md).blocks }))

describe('BlocksView', () => {
  it('escapes pasted HTML instead of drawing it', () => {
    const out = html('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n**ok** <b>bold</b>')
    expect(out).not.toContain('<script')
    expect(out).not.toContain('<img')
    expect(out).not.toContain('<b>')
    expect(out).toContain('&lt;script&gt;')
    expect(out).toContain('<strong>ok</strong>')
  })

  it('never writes a javascript: or data: address into href or src', () => {
    const out = html('[a](javascript:alert(1)) [b](data:text/html,x) ![c](javascript:alert(1)) ![d](data:image/png;base64,AA)')
    expect(out).not.toMatch(/href="(javascript|data):/i)
    expect(out).not.toMatch(/src="(javascript|data):/i)
  })

  it('opens outside links safely and leaves site links alone', () => {
    const out = html('[out](https://example.com/x) [in](/pricing)')
    expect(out).toContain('href="https://example.com/x" rel="noopener" target="_blank"')
    expect(out).toContain('<a href="/pricing">in</a>')
  })

  it('draws headings with ids, lists, a table and a lone image as a figure', () => {
    const out = html('## Pick one\n\n- a\n- b\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n![A plate](https://example.com/p.webp)')
    expect(out).toContain('<h2 id="pick-one">Pick one</h2>')
    expect(out).toContain('<ul><li>a</li><li>b</li></ul>')
    expect(out).toContain('<th scope="col">A</th>')
    expect(out).toContain('<figure><img src="https://example.com/p.webp" alt="A plate" loading="lazy" decoding="async"/><figcaption>A plate</figcaption></figure>')
  })

  it('has no h1: the post title is the page\'s only one', () => {
    expect(html('# Title in the body\n\ntext')).toContain('<h2 id="title-in-the-body">')
    expect(html('# Title in the body')).not.toContain('<h1')
  })
})
