# @deepseek-ai/dsh-tool-coding-harness

English | [中文](README.zh.md)

The coding harness provides a model-facing workflow for repository tasks. It runs a read-only planner, a read-only architect, and an implementation coder through the workflow engine.

## Use

The first `coding_harness` call accepts an objective and returns structured planner and architect reports with `awaiting-approval` status. The caller must obtain explicit human approval before calling the tool again with `approved: true`. The approved call starts the coder stage and returns its changed files, checks, and remaining work.

The workflow uses structured child-agent output, preserves bounded handoffs, and fails when a child returns malformed data. The configured provider must support structured output.

## Configuration

- `subagentProvider`: structured child-agent provider, default `spawn`.
- `maxAgents`: maximum child agents for an approved run, from 2 to 3, default 3.
- `maxHandoffChars`: serialized size limit for each stage report, default 16,384.

## Limitations

Approval is represented by a separate tool call. The tool does not persist a custom artifact event; workflow lifecycle events and the returned reports remain the source of progress and result presentation.
