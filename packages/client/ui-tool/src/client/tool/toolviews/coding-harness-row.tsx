import { IconBranchOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { Context } from '@deepseek-ai/cordis'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ToolCallViewProps } from '../../contract/slots.ts'
import { ToolRow } from '../components/ToolRow.tsx'
import { toolRowModel } from '../models/tool-call-model.ts'
import { CONVERSATION_NS as NS } from '../../locale.ts'
import css from './coding-harness-row.module.css'

type CodingHarnessRowProps = ToolCallViewProps & PropsLocale<'conversation'>

type HarnessStatus = 'awaiting-approval' | 'complete' | 'blocked'
type StageStatus = 'complete' | 'current' | 'pending' | 'blocked'

interface HarnessReport {
  readonly status: HarnessStatus
  readonly planner?: unknown
  readonly architect?: unknown
  readonly coder?: unknown
}

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

function reportFromOutput(output: string | null): HarnessReport | null {
  if (output === null) return null
  try {
    const parsed: unknown = JSON.parse(output)
    if (typeof parsed !== 'object' || parsed === null) return null
    const report = parsed as Partial<HarnessReport>
    return report.status === 'awaiting-approval' || report.status === 'complete' || report.status === 'blocked'
      ? report as HarnessReport
      : null
  } catch {
    return null
  }
}

function stageStatus(report: HarnessReport | null, stage: 'planner' | 'architect' | 'coder'): StageStatus {
  if (report === null) return 'pending'
  if (stage === 'planner') return report.planner === undefined ? 'current' : 'complete'
  if (stage === 'architect') {
    if (report.architect === undefined) return 'current'
    return report.status === 'blocked' && report.coder === undefined ? 'blocked' : 'complete'
  }
  if (report.coder !== undefined) return report.status === 'blocked' ? 'blocked' : 'complete'
  return report.status === 'awaiting-approval' ? 'current' : 'pending'
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
  const report = reportFromOutput(model.output)
  const status = report?.status ?? statusFromOutput(model.output)
  return (
    <div className={css.root} data-harness-status={status ?? undefined}>
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
      {report !== null ? (
        <div className={css.stageRail} aria-label={t('codingHarness.stageSummary')}>
          {(['planner', 'architect', 'coder'] as const).map(stage => (
            <div className={css.stage} data-stage-status={stageStatus(report, stage)} key={stage}>
              <span className={css.stageDot} aria-hidden />
              <span>{t(`codingHarness.stage.${stage}`)}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
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
