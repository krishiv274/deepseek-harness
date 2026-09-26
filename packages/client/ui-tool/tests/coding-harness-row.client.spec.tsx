// @vitest-environment jsdom
/** coding_harness atomic Tool presentation and keyed registration. */
import { cleanup, render, screen } from '@testing-library/react'
import { useDisclosure } from '@deepseek-ai/dsh-client-ui-chat/src/client/chat/use-disclosure.ts'
import type { ToolResultNode } from '@deepseek-ai/dsh-client-ui-chat/client'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { zh } from '@deepseek-ai/dsh-client-ui-conversation/src/client/locales.ts'
import { CodingHarnessRow, codingHarnessToolview } from '../src/client/tool/toolviews/coding-harness-row.tsx'
import { CONVERSATION_NS as NS } from '../src/client/locale.ts'

type CodingHarnessRowProps = Parameters<typeof CodingHarnessRow>[0]
const t: CodingHarnessRowProps['t'] = makeTranslate(zh, commonZh)
afterEach(cleanup)

const report = (status: 'awaiting-approval' | 'complete' | 'blocked'): string => JSON.stringify({
  status,
  planner: {},
  architect: {},
  ...(status === 'complete' ? { coder: {} } : {}),
})

function resultNode(text: string): ToolResultNode {
  return {
    kind: 'tool-result', seq: 10, time: 2_000, callTime: 1_000, callId: 'c1',
    call: { name: 'coding_harness', argsRaw: JSON.stringify({ objective: 'Build the harness' }) },
    content: [{ type: 'text', text }], isError: false, subCalls: [],
  }
}

function rowProps(block: ToolResultNode): CodingHarnessRowProps {
  return {
    useDisclosure,
    callId: 'c1',
    toolName: 'coding_harness',
    phase: 'result',
    block,
    openFile: vi.fn(),
    loadImage: vi.fn(),
    t,
  } as CodingHarnessRowProps
}

describe('CodingHarnessRow', () => {
  it.each([
    ['awaiting-approval', '等待批准'],
    ['complete', '编码完成'],
    ['blocked', '编码受阻'],
  ] as const)('renders the %s workflow state', (status, label) => {
    render(<CodingHarnessRow {...rowProps(resultNode(report(status)))} />)
    expect(screen.getByText('运行编码工作流')).toBeTruthy()
    expect(screen.getByText(label)).toBeTruthy()
    expect(screen.getByText('规划').parentElement?.dataset.stageStatus).toBe('complete')
    expect(screen.getByText('架构').parentElement?.dataset.stageStatus)
      .toBe(status === 'blocked' ? 'blocked' : 'complete')
    expect(screen.getByText('编码').parentElement?.dataset.stageStatus)
      .toBe(status === 'complete' ? 'complete' : status === 'blocked' ? 'pending' : 'current')
  })

  it('registers the coding_harness keyed tool view', () => {
    expect(codingHarnessToolview.name).toBe('coding-harness-toolview')
    expect(codingHarnessToolview.inject).toEqual(['slots'])
    const register = vi.fn((_spec: unknown, _component: unknown) => () => undefined)
    const inject = vi.fn((_name: string, callback: () => () => void) => callback())
    codingHarnessToolview.apply({ slots: { inject, register } } as never)
    expect(inject).toHaveBeenCalledWith('tool.call.toolview', expect.any(Function))
    const [spec, component] = register.mock.calls[0] ?? []
    expect(spec).toEqual({ name: 'tool.call.toolview', key: 'coding_harness', locale: NS })
    expect(component).toBe(CodingHarnessRow)
  })
})
