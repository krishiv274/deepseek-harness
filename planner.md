# Coding Harness Planner

## Purpose

The coding harness turns a repository task into a reviewed implementation cycle: planning, architecture review, human approval, coding, validation, and bounded revision. It uses the repository's existing profiles, agent presets, subagents, workflow engine, session events, and Web renderers.

The harness is CLI-first so the complete workflow can be demonstrated quickly. The Web client presents the same workflow progress and artifacts through existing workflow and plan views.

## Scope

The first version supports a full loop from a user request to a tested code change. Planner and architect are available as standalone presets and as stages in the combined harness workflow.

The first version does not allow autonomous edits before approval, unrestricted revision loops, direct filesystem access from workflow scripts, or a custom workflow graph UI.

## Roles

### Planner

The planner is a read-only repository analyst. It identifies the request's owning code path, nearby tests, constraints, and the smallest implementation slice.

The planner returns:

- Request summary and acceptance criteria.
- Relevant packages, files, symbols, and existing extension points.
- Assumptions and unresolved questions.
- Ordered implementation tasks.
- Focused validation commands.
- Risks that require architecture review.

The planner must not edit files, invent APIs without evidence, or report a check that it did not identify from the repository.

### Architect

The architect is a read-only reviewer of the planner output. It confirms package ownership, public API effects, lifecycle behavior, persistence requirements, UI implications, and test coverage.

The architect returns:

- Approved or revised implementation boundary.
- Component and package responsibilities.
- Data and event flow.
- Preset, subagent, and workflow composition.
- Approval, failure, cancellation, and retry behavior.
- Required documentation and snapshot updates.
- Verification commands and release risks.

The architect must prefer existing repository mechanisms over new abstractions and must identify any requirement that cannot be implemented safely within the selected scope.

### Coder

The coder receives only the approved planner and architect artifacts. It edits the repository, runs focused checks, and reports changed files, commands, failures, and remaining work.

The coder may not expand the approved scope without returning to the architect stage.

### Reviewer

The reviewer examines the implementation and validation results. It checks acceptance criteria, regression risk, test coverage, documentation, and whether the coder's report matches the actual worktree.

## Workflow

```text
request
  -> planner scan
  -> architect review
  -> human approval
  -> coder implementation
  -> focused validation
  -> reviewer assessment
  -> complete | blocked | bounded revision
```

The planner and architect run as separate child-agent stages. The workflow passes structured results between stages rather than relying on prose parsing.

Approval is mandatory before the coder receives write-capable tools. A rejected plan returns to the planner or architect with the user's feedback. A validation failure returns only the diagnostics and relevant approved context to the coder or reviewer.

Revision attempts have a configured upper bound. When the bound is reached, the workflow ends as `blocked` with the failing commands and diagnostics preserved in the session.

## Runtime Composition

The combined harness is an agent preset registered alongside the standalone planner and architect presets. The presets use the existing standard composition and isolate role-specific capabilities where required.

The workflow starts through `ctx.workflowEngine.start()` and uses existing workflow stages for child-agent execution, progress logging, and terminal results. Child agents start through `ctx.subagents.start(...)`; continuable children are used only when a stage must resume across a later turn.

Workflow scripts coordinate agents and state transitions. Repository inspection, file edits, shell commands, and model interaction remain agent capabilities rather than direct workflow-script operations.

The implementation should use the structured handoff and bounded iteration patterns in `packages/workflow/tool-ralph`, the progress and lifecycle patterns in `packages/workflow/tool-workflow`, and the child lifecycle APIs in `packages/subagent`.

## Handoff Contracts

Each stage produces a typed result with a terminal status. The minimum statuses are `complete`, `blocked`, and `failed`.

Planner results contain the request summary, acceptance criteria, repository findings, task list, validation commands, and risks.

Architect results contain the approved boundary, component responsibilities, data flow, capability composition, approval behavior, failure behavior, documentation requirements, and verification plan.

Coder results contain the changed file list, commands executed, command outcomes, implementation notes, and unresolved issues.

Reviewer results contain acceptance status, findings, regression risks, missing tests or docs, and the next allowed action.

Malformed or incomplete child results fail the owning stage with an actionable diagnostic. The parent workflow must never silently treat an invalid result as approval.

## Persistence and Presentation

Workflow lifecycle events and agent activity remain reconstructable from the existing session log. The first version reuses existing workflow progress and plan artifact renderers.

A dedicated event is required only if planner or architect artifacts cannot be reconstructed from existing logged tool and workflow metadata. Any new model-visible input must have a corresponding session event.

The Web presentation shows the current role, stage status, approval state, plan artifact, validation results, and final summary. Product copy uses the existing locale-owned client dictionaries.

## Implementation Milestones

1. Add this planner contract and agree on the structured handoff fields.
2. Register standalone planner and architect presets.
3. Register the combined coding harness preset.
4. Implement the planner-to-architect workflow with approval gating.
5. Add coder execution, focused validation, and bounded revisions.
6. Reuse existing CLI and Web workflow presentation.
7. Add unit, composition, Web, and snapshot coverage for changed behavior.
8. Document startup and run one small end-to-end repository task.

## Verification

Focused tests must cover role-result validation, stage transitions, approval gating, cancellation, revision limits, and blocked or failed terminal states.

The CLI demonstration must prove that planner and architect cannot edit before approval, the coder edits only after approval, and failed checks stop at the configured revision limit.

The Web demonstration must show stage progress, approval state, plan output, changed files, and validation diagnostics after reload.

Repository checks for the implementation include `pnpm run verify-cordis-config`, `pnpm run verify-tool-catalog`, `pnpm run typecheck`, `pnpm run lint`, `pnpm run build`, relevant Web tests, and `pnpm run doc-sync`.

## Primary Extension Points

- `packages/preset/agent-preset/src/index.ts`
- `packages/preset/agent-preset-registry/src/index.ts`
- `packages/workflow/tool-ralph/src/index.ts`
- `packages/workflow/tool-workflow/src/index.ts`
- `packages/subagent/subagent/src/index.ts`
- `packages/bundle/web-app/presets/standard.patch.yml`
- `packages/bundle/web-app/presets/cordis.patch.yml`
- `packages/client/ui-workflow-run/src/client/workflow-definition.ts`
- `packages/client/ui-plan/src/client/plan-definition.ts`
- `apps/cli/src/profile-boot.ts`