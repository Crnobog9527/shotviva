import { describe, expect, it } from 'vitest'

import { parseMarkdown } from './index'

const blocks = (md: string) => parseMarkdown(md).blocks

describe('blocks', () => {
  it('turns # and ## into h2, ### into h3, deeper into h4, and numbers the repeats', () => {
    const { blocks: b, toc } = parseMarkdown('# One\n\n## One\n\n### Sub\n\n##### Deep')
    expect(b.map((x) => (x.t === 'heading' ? x.level : 0))).toEqual([2, 2, 3, 4])
    expect(toc).toEqual([
      { id: 'one', text: 'One', level: 2 },
      { id: 'one-2', text: 'One', level: 2 },
      { id: 'sub', text: 'Sub', level: 3 },
    ])
  })

  it('keeps Chinese headings as ids', () => {
    expect(parseMarkdown('## 价格对比').toc[0].id).toBe('价格对比')
  })

  it('joins wrapped lines into one paragraph', () => {
    expect(blocks('first\nsecond\n\nthird')).toHaveLength(2)
  })

  it('reads bullet and numbered lists with a nested list', () => {
    const [list] = blocks('- a\n  - a1\n  - a2\n- b')
    expect(list).toMatchObject({ t: 'list', ordered: false })
    if (list.t !== 'list') throw new Error('list')
    expect(list.items).toHaveLength(2)
    expect(list.items[0].children[0]).toMatchObject({ t: 'list' })
    expect(blocks('1. x\n2. y')[0]).toMatchObject({ t: 'list', ordered: true })
  })

  it('reads a fenced block without parsing its inside', () => {
    expect(blocks('```ts\n# not a heading\n**no**\n```')).toEqual([{ t: 'code', lang: 'ts', v: '# not a heading\n**no**' }])
  })

  it('reads quotes, rules and tables', () => {
    expect(blocks('> hi\n> there')[0]).toMatchObject({ t: 'quote' })
    expect(blocks('---')[0]).toEqual({ t: 'hr' })
    const table = blocks('| Tool | Price |\n| :-- | --: |\n| A | $1 |\n| B |')[0]
    expect(table).toMatchObject({ t: 'table', align: ['left', 'right'] })
    if (table.t !== 'table') throw new Error('table')
    expect(table.rows).toHaveLength(2)
    expect(table.rows[1]).toHaveLength(2)
  })
})

describe('inline', () => {
  const inline = (md: string) => {
    const [p] = blocks(md)
    if (p.t !== 'p') throw new Error('paragraph')
    return p.c
  }

  it('reads strong, emphasis, code and links', () => {
    expect(inline('**a** *b* `c` [d](/pricing)')).toEqual([
      { t: 'strong', c: [{ t: 'text', v: 'a' }] },
      { t: 'text', v: ' ' },
      { t: 'em', c: [{ t: 'text', v: 'b' }] },
      { t: 'text', v: ' ' },
      { t: 'code', v: 'c' },
      { t: 'text', v: ' ' },
      { t: 'link', href: '/pricing', c: [{ t: 'text', v: 'd' }] },
    ])
  })

  it('leaves snake_case and a lone star alone', () => {
    expect(inline('use my_var_name and 2 * 3')).toEqual([{ t: 'text', v: 'use my_var_name and 2 * 3' }])
  })

  it('never makes HTML: tags stay text', () => {
    expect(inline('<script>alert(1)</script> <img src=x onerror=alert(1)>')).toEqual([
      { t: 'text', v: '<script>alert(1)</script> <img src=x onerror=alert(1)>' },
    ])
  })

  it('drops unsafe link and image addresses but keeps the words', () => {
    for (const href of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,x', '//evil.example', '/\\evil.example', 'vbscript:x']) {
      expect(inline(`[click](${href})`)).toEqual([{ t: 'text', v: 'click' }])
    }
    for (const src of ['javascript:alert(1)', 'http://insecure.example/a.png', 'data:image/png;base64,AAAA']) {
      expect(inline(`![x](${src})`).some((node) => node.t === 'image')).toBe(false)
    }
  })

  it('allows https, mailto, anchors and site paths', () => {
    expect(inline('[a](https://example.com/x?y=1) [b](mailto:hi@example.com) [c](#top) [d](/zh/pricing)').filter((n) => n.t === 'link')).toHaveLength(4)
  })

  it('reads an image', () => {
    expect(inline('![A bag](https://shotviva.com/assets/blog/a.webp)')).toEqual([{ t: 'image', src: 'https://shotviva.com/assets/blog/a.webp', alt: 'A bag' }])
  })
})
