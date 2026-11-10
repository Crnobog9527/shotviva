import { createElement, useState } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { TEST_RUN_COPY as copy } from './copy'
import { useTestPanel, type TestPanelFeedback } from './use-test-panel'

describe('test asset deletion feedback', () => {
  it('replaces a refusal with the successful retry and a later refusal replaces success', () => {
    const seen: (TestPanelFeedback | null)[] = []
    const refusal = '所选照片有试跑正在进行'
    function Retry() {
      const panel = useTestPanel('fixture')
      const [step, advance] = useState(0)
      seen.push(panel.feedback)
      if (step < 3) {
        if (step === 1) panel.setNotice(copy.removal.done)
        else panel.setError(refusal)
        advance(step + 1)
      }
      return null
    }
    renderToStaticMarkup(createElement(Retry))
    expect(seen).toEqual([
      null, { kind: 'error', message: refusal }, { kind: 'notice', message: copy.removal.done }, { kind: 'error', message: refusal },
    ])
  })

  it('names the selected resource and count on the delete button', () => {
    expect(copy.removal.submit('photo', 1)).toBe('删除 1 张照片')
    expect(copy.removal.submit('run', 2)).toBe('删除 2 条记录')
  })
})
