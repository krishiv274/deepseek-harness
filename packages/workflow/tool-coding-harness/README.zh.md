# @deepseek-ai/dsh-tool-coding-harness

[English](README.md) | 中文

Coding harness 为仓库任务提供面向模型的工作流。它通过工作流引擎依次运行只读规划器、只读架构师和实现编码器。

## 使用方式

第一次调用 `coding_harness` 时传入目标，工具会返回结构化的规划器和架构师报告，并将状态设为 `awaiting-approval`。调用方必须先获得明确的人类批准，然后再次传入 `approved: true` 调用工具。批准后的调用会启动编码器阶段，并返回变更文件、检查结果和剩余工作。

工作流使用结构化的子代理输出，限制各阶段交接数据的大小，并在子代理返回格式错误时失败。配置的 provider 必须支持结构化输出。

## 配置

- `subagentProvider`：结构化子代理 provider，默认为 `spawn`。
- `maxAgents`：批准后的调用最多启动的子代理数量，范围为 2 到 3，默认为 3。
- `maxHandoffChars`：每个阶段报告的序列化大小上限，默认为 16,384。

## 限制

批准通过单独的工具调用表示。工具不会持久化自定义 artifact 事件；工作流生命周期事件和返回的报告仍是进度与结果展示的来源。
