import { IconBranchOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { Context } from '@deepseek-ai/cordis'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ToolCallViewProps } from '../../contract/slots.ts'
import { ToolRow } from '../components/ToolRow.tsx'
import { toolRowModel } from '../models/tool-call-model.ts'
import { CONVERSATION_NS as NS } from '../../locale.ts'

type CodingHarnessRowProps = ToolCallViewProps & PropsLocale<'conversation'>

type HarnessStatus = 'awaiting-approval' | 'complete' | 'blocked'

function statusFromOutput(output: string | null): HarnessStatus | null {
  if (output === null) return null
  try {
    const parsed: unknown = JSON.parse(output)
    if (typeof parsed !== 'object' || parsed === null) return null
    const status = (parsed as { status?: unknown }).status
    return status === 'awaiting-approval' || status === 'complete' || status === 'blocked' ? status : null
  } catch {
    return null
  }
}

function summary(status: HarnessStatus | null, fallback: string, t: CodingHarnessRowProps['t']): string {
  switch (status) {
    case 'awaiting-approval': return t('codingHarness.awaitingApproval')
    case 'complete': return t('codingHarness.complete')
    case 'blocked': return t('codingHarness.blocked')
    default: return fallback
  }
}

/** Render the planner, architect, approval, and coder report in the shared Tool row. */
export function CodingHarnessRow({ block, inspect, toolName, useDisclosure, t }: CodingHarnessRowProps) {
  const model = toolRowModel(toolName, block)
  const status = statusFromOutput(model.output)
  return (
    <ToolRow
      useDisclosure={useDisclosure}
      t={t}
      variant="others"
      toolName={toolName}
      icon={<IconBranchOutlineRegular />}
      title={t('tool.title.codingHarness')}
      summary={summary(status, model.summary, t)}
      bodyRaw={model.bodyRaw}
      output={model.output}
      errorSummary={model.errorSummary}
      state={model.state}
      inspect={inspect}
    />
  )
}

/** Register the coding-harness tool row. */
export const codingHarnessToolview = {
  name: 'coding-harness-toolview',
  inject: ['slots'],
  apply(ctx: Context): void {
    ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
      name: 'tool.call.toolview', key: 'coding_harness', locale: NS,
    }, CodingHarnessRow))
  },
}
