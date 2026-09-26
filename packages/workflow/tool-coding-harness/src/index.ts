/** Model-facing planner, architect, approval, and coding workflow. */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolCallView, ToolResultView } from '@deepseek-ai/dsh-tools'
import type { SubagentProvider } from '@deepseek-ai/dsh-subagent'
import type { WorkflowResult, WorkflowRun } from '@deepseek-ai/dsh-workflow'

export const name = 'tool-coding-harness'
export const inject = ['tools', 'workflowEngine', 'subagents', 'systemPrompt']

/** Configuration for the planner, architect, and coder workflow. */
export interface Config {
  /** Structured child-agent provider used for each workflow stage. */
  subagentProvider?: string
  /** Maximum number of child agents, including planner, architect, and coder. */
  maxAgents?: number
  /** Maximum serialized size of one structured handoff. */
  maxHandoffChars?: number
}

/** Schemastery configuration for the coding harness. */
export const Config: z<Config> = z.object({
  subagentProvider: z.string().default('spawn'),
  maxAgents: z.number().step(1).min(2).max(3).default(3),
  maxHandoffChars: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(16_384),
})

type PlannerStatus = 'complete' | 'blocked'
type ArchitectStatus = 'approved' | 'blocked'
type CoderStatus = 'complete' | 'blocked'
type HarnessStatus = 'awaiting-approval' | 'complete' | 'blocked'

interface PlannerReport {
  readonly status: PlannerStatus
  readonly summary: string
  readonly acceptanceCriteria: string[]
  readonly findings: string[]
  readonly tasks: string[]
  readonly validation: string[]
  readonly risks: string[]
}

interface ArchitectReport {
  readonly status: ArchitectStatus
  readonly boundary: string
  readonly responsibilities: string[]
  readonly dataFlow: string[]
  readonly risks: string[]
  readonly verification: string[]
}

interface CoderReport {
  readonly status: CoderStatus
  readonly summary: string
  readonly changedFiles: string[]
  readonly checks: string[]
  readonly remaining: string[]
}

type HarnessResult =
  | { readonly status: 'awaiting-approval'; readonly planner: PlannerReport; readonly architect: ArchitectReport }
  | { readonly status: HarnessStatus; readonly planner: PlannerReport; readonly architect: ArchitectReport; readonly coder: CoderReport }

interface HarnessArgs {
  readonly objective: string
  readonly approved?: boolean
}

const PLANNER_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['complete', 'blocked'] },
    summary: { type: 'string' },
    acceptanceCriteria: { type: 'array', items: { type: 'string' } },
    findings: { type: 'array', items: { type: 'string' } },
    tasks: { type: 'array', items: { type: 'string' } },
    validation: { type: 'array', items: { type: 'string' } },
    risks: { type: 'array', items: { type: 'string' } },
  },
  required: ['status', 'summary', 'acceptanceCriteria', 'findings', 'tasks', 'validation', 'risks'],
  additionalProperties: false,
}

const ARCHITECT_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['approved', 'blocked'] },
    boundary: { type: 'string' },
    responsibilities: { type: 'array', items: { type: 'string' } },
    dataFlow: { type: 'array', items: { type: 'string' } },
    risks: { type: 'array', items: { type: 'string' } },
    verification: { type: 'array', items: { type: 'string' } },
  },
  required: ['status', 'boundary', 'responsibilities', 'dataFlow', 'risks', 'verification'],
  additionalProperties: false,
}

const CODER_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['complete', 'blocked'] },
    summary: { type: 'string' },
    changedFiles: { type: 'array', items: { type: 'string' } },
    checks: { type: 'array', items: { type: 'string' } },
    remaining: { type: 'array', items: { type: 'string' } },
  },
  required: ['status', 'summary', 'changedFiles', 'checks', 'remaining'],
  additionalProperties: false,
}

const HARNESS_META = {
  name: 'coding-harness',
  description: 'Plan, review, approve, and implement one repository task.',
  phases: [
    { title: 'Planner', detail: 'Read-only repository analysis.' },
    { title: 'Architect', detail: 'Read-only architecture review.' },
    { title: 'Coder', detail: 'Implementation after explicit approval.' },
  ],
}

const HARNESS_SCRIPT = String.raw`
function normalizedText(value) {
  return typeof value === 'string' && value.length > 0 && value === value.trim()
}

function normalizedList(value) {
  return Array.isArray(value) && value.every(normalizedText)
}

function validateReport(report, fields) {
  if (report === null || typeof report !== 'object' || Array.isArray(report)) {
    throw new Error('coding harness child returned no structured report')
  }
  for (const field of fields) {
    if (field.endsWith('[]')) {
      if (!normalizedList(report[field.slice(0, -2)])) throw new Error('coding harness report has invalid list fields')
    } else if (!normalizedText(report[field])) {
      throw new Error('coding harness report has an invalid text field')
    }
  }
  return report
}

phase('Planner')
const planner = validateReport(await agent([
  'You are the planner for a coding harness.',
  'Inspect the repository read-only and identify the smallest implementation slice for this objective.',
  'Return only the requested structured report. Do not edit files or run commands that rewrite the workspace.',
  'Objective:\\n' + args.objective,
].join('\\n\\n'), { schema: args.plannerSchema, label: 'Planner', phase: 'Planner' }), [
  'status', 'summary', 'acceptanceCriteria[]', 'findings[]', 'tasks[]', 'validation[]', 'risks[]',
])

phase('Architect')
const architect = validateReport(await agent([
  'You are the architect for a coding harness.',
  'Review the planner report against the current repository. Confirm package ownership, public APIs, lifecycle, persistence, UI, failure behavior, and tests.',
  'Return blocked when the plan cannot be implemented safely within its stated boundary.',
  'Objective:\\n' + args.objective,
  'Planner report:\\n' + JSON.stringify(planner),
].join('\\n\\n'), { schema: args.architectSchema, label: 'Architect', phase: 'Architect' }), [
  'status', 'boundary', 'responsibilities[]', 'dataFlow[]', 'risks[]', 'verification[]',
])

if (planner.status === 'blocked' || architect.status === 'blocked') {
  return { status: 'blocked', planner, architect }
}
if (!args.approved) return { status: 'awaiting-approval', planner, architect }

phase('Coder')
const coder = validateReport(await agent([
  'You are the coding agent.',
  'Implement only the approved boundary. You may edit files and run focused checks.',
  'Do not expand scope. Return the structured implementation report after verification.',
  'Objective:\\n' + args.objective,
  'Approved planner report:\\n' + JSON.stringify(planner),
  'Approved architect report:\\n' + JSON.stringify(architect),
].join('\\n\\n'), { schema: args.coderSchema, label: 'Coder', phase: 'Coder' }), [
  'status', 'summary', 'changedFiles[]', 'checks[]', 'remaining[]',
])
return { status: coder.status === 'complete' ? 'complete' : 'blocked', planner, architect, coder }
`

function resolveConfig(config: Config): Required<Config> {
  const resolved = {
    subagentProvider: config.subagentProvider ?? 'spawn',
    maxAgents: config.maxAgents ?? 3,
    maxHandoffChars: config.maxHandoffChars ?? 16_384,
  }
  if (resolved.subagentProvider.length === 0 || resolved.subagentProvider !== resolved.subagentProvider.trim()) {
    throw new TypeError('subagentProvider must be a non-empty normalized string')
  }
  if (!Number.isSafeInteger(resolved.maxAgents) || resolved.maxAgents < 2 || resolved.maxAgents > 3) {
    throw new TypeError('maxAgents must be 2 or 3')
  }
  if (!Number.isSafeInteger(resolved.maxHandoffChars) || resolved.maxHandoffChars < 1) {
    throw new TypeError('maxHandoffChars must be a positive safe integer')
  }
  return resolved
}

function requireStructuredProvider(ctx: Context, providerName: string): SubagentProvider {
  const provider = ctx.subagents.getProvider(providerName)
  if (provider === undefined) throw new Error(`Coding harness provider "${providerName}" is not registered`)
  if (!provider.capabilities.outputSchema) throw new Error(`Coding harness provider "${providerName}" does not support structured output`)
  return provider
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}

function readPlanner(value: unknown, maxChars: number): PlannerReport {
  if (!isRecord(value)
    || (value.status !== 'complete' && value.status !== 'blocked')
    || typeof value.summary !== 'string'
    || !isStringList(value.acceptanceCriteria)
    || !isStringList(value.findings)
    || !isStringList(value.tasks)
    || !isStringList(value.validation)
    || !isStringList(value.risks)) {
    throw new Error('Coding harness returned a malformed planner report')
  }
  const report: PlannerReport = {
    status: value.status,
    summary: value.summary,
    acceptanceCriteria: value.acceptanceCriteria,
    findings: value.findings,
    tasks: value.tasks,
    validation: value.validation,
    risks: value.risks,
  }
  if (JSON.stringify(report).length > maxChars) throw new Error('Coding harness planner report exceeds maxHandoffChars')
  return report
}

function readArchitect(value: unknown, maxChars: number): ArchitectReport {
  if (!isRecord(value)
    || (value.status !== 'approved' && value.status !== 'blocked')
    || typeof value.boundary !== 'string'
    || !isStringList(value.responsibilities)
    || !isStringList(value.dataFlow)
    || !isStringList(value.risks)
    || !isStringList(value.verification)) {
    throw new Error('Coding harness returned a malformed architect report')
  }
  const report: ArchitectReport = {
    status: value.status,
    boundary: value.boundary,
    responsibilities: value.responsibilities,
    dataFlow: value.dataFlow,
    risks: value.risks,
    verification: value.verification,
  }
  if (JSON.stringify(report).length > maxChars) throw new Error('Coding harness architect report exceeds maxHandoffChars')
  return report
}

function readCoder(value: unknown, maxChars: number): CoderReport {
  if (!isRecord(value)
    || (value.status !== 'complete' && value.status !== 'blocked')
    || typeof value.summary !== 'string'
    || !isStringList(value.changedFiles)
    || !isStringList(value.checks)
    || !isStringList(value.remaining)) {
    throw new Error('Coding harness returned a malformed coder report')
  }
  const report: CoderReport = {
    status: value.status,
    summary: value.summary,
    changedFiles: value.changedFiles,
    checks: value.checks,
    remaining: value.remaining,
  }
  if (JSON.stringify(report).length > maxChars) throw new Error('Coding harness coder report exceeds maxHandoffChars')
  return report
}

function readResult(value: unknown, maxChars: number): HarnessResult {
  if (!isRecord(value)
    || (value.status !== 'awaiting-approval' && value.status !== 'complete' && value.status !== 'blocked')) {
    throw new Error('Coding harness returned an invalid terminal status')
  }
  const planner = readPlanner(value.planner, maxChars)
  const architect = readArchitect(value.architect, maxChars)
  if (value.status === 'awaiting-approval') {
    if (value.coder !== undefined) throw new Error('Coding harness requested approval after coding')
    return { status: value.status, planner, architect }
  }
  if (value.coder === undefined) throw new Error('Coding harness completed without a coder report')
  return { status: value.status, planner, architect, coder: readCoder(value.coder, maxChars) }
}

function stopReasonError(result: WorkflowResult): string | undefined {
  switch (result.stopReason) {
    case 'completed': return undefined
    case 'cancelled': return `Coding harness was cancelled${result.error === undefined ? '' : ` (${result.error})`}`
    case 'error': return `Coding harness failed: ${result.error ?? 'unknown error'}`
    default: return `Coding harness ended abnormally (${String(result.stopReason satisfies never)})`
  }
}

function presentCall(args: HarnessArgs): ToolCallView {
  return { card: 'generic', title: 'coding harness', rawInput: args.objective }
}

function presentResult(_args: HarnessArgs, _result: { content: unknown[]; isError: boolean }): ToolResultView {
  return { card: 'generic' }
}

/** Register the structured planner, architect, approval, and coder workflow. */
export function apply(ctx: Context, config: Config): void {
  const resolved = resolveConfig(config)
  ctx.systemPrompt.section({
    name: 'tool:coding-harness',
    order: ctx.systemPrompt.getSectionOrder('TOOL_WORKFLOW'),
    text: 'Use coding_harness for a repository task that needs a planner, an architecture review, and an implementation handoff. Call it without approved for analysis and present its result for human approval. Call it with approved only after the direct human explicitly approves the returned architect boundary.',
  })
  ctx.tools.register(defineTool({
    name: 'coding_harness',
    description: 'Run a structured planner and architect review for one coding objective. The first call is read-only and returns an approval-ready plan. Set approved=true only after the direct human explicitly approves the architect boundary; that call permits the coder stage to edit the workspace.',
    parameters: {
      objective: {
        type: 'string',
        required: true,
        description: 'The repository objective to plan and implement.',
      },
      approved: {
        type: 'boolean',
        description: 'Set true only after explicit human approval of the returned architect report.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          runId: { type: 'string', required: true },
          agentsStarted: { type: 'integer', required: true },
          result: { type: 'json', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value.result, null, 2) }],
    },
    async execute(args, exec) {
      const parent = exec.agent
      if (parent === undefined) throw new Error('Coding harness requires a calling agent')
      const objective = args.objective.trim()
      if (objective.length === 0) throw new Error('Coding harness objective must be a non-empty string')
      const approved = args.approved ?? false
      const maxTotalAgents = approved ? resolved.maxAgents : 2
      requireStructuredProvider(ctx, resolved.subagentProvider)
      const run: WorkflowRun = ctx.workflowEngine.start({
        script: HARNESS_SCRIPT,
        meta: HARNESS_META,
        args: {
          objective,
          approved,
          plannerSchema: PLANNER_SCHEMA,
          architectSchema: ARCHITECT_SCHEMA,
          coderSchema: CODER_SCHEMA,
        },
        subagentProvider: resolved.subagentProvider,
        maxTotalAgents,
        parent,
        signal: exec.signal,
      })
      const onAbort = (): void => { run.cancel('parent step aborted') }
      exec.signal.addEventListener('abort', onAbort, { once: true })
      if (exec.signal.aborted) run.cancel('parent step aborted')
      try {
        const settled = await run.result
        const error = stopReasonError(settled)
        if (error !== undefined) throw new Error(error)
        return {
          runId: run.id,
          agentsStarted: settled.agentsStarted,
          result: readResult(settled.value, resolved.maxHandoffChars) as unknown as JsonValue,
        }
      } finally {
        exec.signal.removeEventListener('abort', onAbort)
        await run.dispose()
      }
    },
    presentCall,
    presentResult,
  }))
}
