import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import type { SubagentCapabilities, SubagentProvider, SubagentRun, SubagentStartRequest } from '@deepseek-ai/dsh-subagent'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { type ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import { WorkflowRunId, WorkflowEngine } from '@deepseek-ai/dsh-workflow'
import type { WorkflowResult, WorkflowRun, WorkflowStartRequest } from '@deepseek-ai/dsh-workflow'
import * as toolCodingHarness from '../src/index.ts'

const testToolSignal = new AbortController().signal

class StubEngine extends WorkflowEngine {
  requests: WorkflowStartRequest[] = []
  disposed = 0
  settle!: (result: WorkflowResult) => void

  start(request: WorkflowStartRequest): WorkflowRun {
    this.requests.push(request)
    const result = new Promise<WorkflowResult>((resolve) => { this.settle = resolve })
    return {
      id: WorkflowRunId(`coding-harness-${this.requests.length}`),
      meta: request.meta,
      result,
      cancel: (reason?: string) => {
        this.settle({ value: null, stopReason: 'cancelled', error: reason, agentsStarted: 0 })
      },
      dispose: async () => { this.disposed += 1 },
    }
  }
}

class StubProvider implements SubagentProvider {
  readonly name = 'structured'
  readonly capabilities: SubagentCapabilities = {
    agentOptions: true,
    outputSchema: true,
    depthLimit: true,
    toolFilter: true,
    persona: true,
  }
  readonly inheritsParentContext = false

  start(_request: SubagentStartRequest): Promise<SubagentRun> {
    return Promise.reject(new Error('StubProvider.start must not be reached behind StubEngine'))
  }
}

async function setup() {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(SubagentRuntime)
  ctx.subagents.registerProvider(new StubProvider())
  await ctx.plugin(StubEngine)
  await ctx.plugin(toolCodingHarness, { subagentProvider: 'structured' })
  const parent = { id: SessionId('caller'), options: {} } as unknown as Agent
  return { ctx, engine: ctx.workflowEngine as StubEngine, parent }
}

function execute(ctx: Context, args: unknown, parent: Agent): Promise<ToolExecutionResult> {
  return ctx.tools.execute({
    signal: testToolSignal,
    callId: ToolCallId('coding-harness-call'),
    name: 'coding_harness',
    arguments: args,
    agent: parent,
  })
}

const PLANNER = {
  status: 'complete',
  summary: 'The owning package is identified.',
  acceptanceCriteria: ['The workflow returns a structured approval handoff.'],
  findings: ['The existing workflow engine supports staged child agents.'],
  tasks: ['Add the orchestrator tool.'],
  validation: ['Run the focused tool test.'],
  risks: [],
}

const ARCHITECT = {
  status: 'approved',
  boundary: 'Add one model-facing workflow tool.',
  responsibilities: ['The tool owns stage coordination.'],
  dataFlow: ['Planner output feeds the architect.'],
  risks: [],
  verification: ['Run the package typecheck.'],
}

const CODER = {
  status: 'complete',
  summary: 'The approved implementation is complete.',
  changedFiles: ['packages/workflow/tool-coding-harness/src/index.ts'],
  checks: ['Focused tests pass.'],
  remaining: [],
}

describe('dsh-tool-coding-harness', () => {
  it('stops after planner and architect until approval', async () => {
    const { ctx, engine, parent } = await setup()
    const pending = execute(ctx, { objective: '  Build the harness.  ' }, parent)
    await vi.waitFor(() => { expect(engine.requests).toHaveLength(1) })
    expect(engine.requests[0]).toMatchObject({
      meta: { name: 'coding-harness' },
      args: { objective: 'Build the harness.', approved: false },
      maxTotalAgents: 2,
      parent,
    })
    expect(engine.requests[0]!.script).toContain("status: 'awaiting-approval'")
    engine.settle({
      value: { status: 'awaiting-approval', planner: PLANNER, architect: ARCHITECT },
      stopReason: 'completed',
      agentsStarted: 2,
    })
    const result = await pending
    expect(result.isError).toBe(false)
    if (result.isError) throw new Error('expected approval handoff')
    expect(result.value).toMatchObject({
      runId: 'coding-harness-1',
      agentsStarted: 2,
      result: { status: 'awaiting-approval', planner: PLANNER, architect: ARCHITECT },
    })
    expect(engine.disposed).toBe(1)
  })

  it('starts the coder only for an approved call', async () => {
    const { ctx, engine, parent } = await setup()
    const pending = execute(ctx, { objective: 'Build the harness.', approved: true }, parent)
    await vi.waitFor(() => { expect(engine.requests).toHaveLength(1) })
    expect(engine.requests[0]!.args).toMatchObject({ approved: true })
    expect(engine.requests[0]!.maxTotalAgents).toBe(3)
    expect(engine.requests[0]!.script).toContain("phase('Coder')")
    engine.settle({
      value: { status: 'complete', planner: PLANNER, architect: ARCHITECT, coder: CODER },
      stopReason: 'completed',
      agentsStarted: 3,
    })
    const result = await pending
    expect(result.isError).toBe(false)
    if (result.isError) throw new Error('expected coder result')
    expect(result.value).toMatchObject({ result: { status: 'complete', coder: CODER } })
  })

  it('rejects malformed stage results', async () => {
    const { ctx, engine, parent } = await setup()
    const pending = execute(ctx, { objective: 'Build the harness.' }, parent)
    await vi.waitFor(() => { expect(engine.requests).toHaveLength(1) })
    engine.settle({
      value: { status: 'awaiting-approval', planner: PLANNER, architect: { ...ARCHITECT, verification: 'invalid' } },
      stopReason: 'completed',
      agentsStarted: 2,
    })
    const result = await pending
    expect(result.isError).toBe(true)
  })
})
