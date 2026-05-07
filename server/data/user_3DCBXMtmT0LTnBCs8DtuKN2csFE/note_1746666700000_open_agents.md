---
id: note_1746666700000_open_agents
type: raw
title: "05.08 · vercel-labs/open-agents：Vercel 入场 Agent 赛道，它的架构决策值得细看"
tags:
  - GitHub
  - Vercel
  - AI Agent
  - 架构
  - 基础设施
links: []
space: 日报采编
date: '2026-05-08'
read: false
created: '2026-05-08T01:02:00.000Z'
updated: '2026-05-08T01:02:00.000Z'
---

项目地址：[github.com/vercel-labs/open-agents](https://github.com/vercel-labs/open-agents)
语言：TypeScript
今日 ⭐：131 stars（新仓库，数字会快速涨）
**发布方：Vercel Labs 官方**

---

## 核心定位

Vercel 官方推出的"**后台编码 Agent**"参考实现。用作 fork 模板——你照着它改一改，就能部署一个自己的 Cursor/Claude Code 类产品。

和其他 agent 项目最大的差异：**这是 Vercel 对"agent 应该长什么样"的官方架构建议**。带着 Vercel 的基础设施方法论（sandbox、workflow、durable 运行）。

---

## 三层架构（这是本质）

```
Web  →  Agent workflow  →  Sandbox VM
```

- **Web 层**：认证、会话、聊天 UI、流式渲染
- **Agent 层**：跑在 Vercel 的**持久工作流**（Workflow SDK）里，不绑定单次 HTTP 请求
- **Sandbox 层**：Vercel 自己的 sandbox（文件系统、shell、git、dev server、预览端口）

---

## 最值得注意的架构决策

### 「Agent 不跑在 sandbox 里面」

作者用**一整个段落**强调了这个决策：

> The agent does not run inside the VM. It runs outside the sandbox and interacts with it through tools like file reads, edits, search, and shell commands.

**为什么这个分离这么重要？**

Vercel 列了四条：
1. Agent 执行不被单次请求生命周期限制
2. Sandbox 生命周期可以独立 hibernate 和 resume
3. 模型/provider 选择和 sandbox 实现可以各自演进
4. **VM 保持纯执行环境**，不变成控制平面

翻译成人话：**agent 的"大脑"和"手"要分开**。大脑（LLM + 决策逻辑）在外面，手（文件系统、shell）在 sandbox 里。

---

## 这跟其他 agent 实现有什么不同

对比主流架构：

| 方案 | Agent 位置 | Sandbox 位置 | 痛点 |
|------|-----------|-------------|------|
| **Claude Code / Cursor CLI** | 用户本机 | 用户本机 | 要用户一直开着电脑 |
| **Claude API + 你自己的 backend** | 你的 server | 你的 server | Backend 变复杂，难扩展 |
| **v0 / Lovable / Replit Agents** | 前端 | 前端/沙盒 | 无法长任务 |
| **Open Agents（本项目）** | **Vercel Workflow** | **Vercel Sandbox** | 需要 Vercel 生态绑定 |

**Vercel 的牌**：它有**整个栈**可用——Workflow（durable execution）、Sandbox（无状态 VM）、Auth（Better Auth）、Storage（Neon/Upstash）。把 agent 做成 Vercel 生态的"杀手应用"，把更多客户锁进 Vercel。

---

## 当前能力（README 列的）

- Chat 驱动的编码 agent（file/search/shell/task/skill/web tools）
- 用 Workflow SDK 做持久多步骤执行
- Sandbox 支持 **snapshot-based resume**（断了能恢复）
- 仓库 clone / 分支切换在 sandbox 里
- 可选自动 commit + push + 开 PR
- **只读 session 分享**
- 可选语音输入（ElevenLabs）

---

## 我的判断

### ① Vercel 这是在抢"AI agent 基建"的定位

Vercel 过去是 **Next.js 的官方托管平台**。现在它明显在扩展：
- **Serverless Functions** → 为 AI 应用优化
- **Sandbox** → 给 agent 跑代码用
- **Workflow SDK** → 给 agent 做长任务用
- **Open Agents** → 官方 agent 模板

**这是把 Vercel 从"前端托管"转型成"AI 应用基建"的组合拳**。

### ② "Agent 外置，Sandbox 独立" 是未来主流架构

我同意 Vercel 的这个判断。理由：

**Agent 逻辑变化比 sandbox 快**：
- 模型 3 个月换一代（Claude 3.5 → 4 → 4.5 → 4.6...）
- Tool schema 定期更新
- Agent 策略逻辑频繁迭代

**Sandbox 变化慢**：
- 基础 runtime（Node、Python 版本）相对稳定
- 文件系统、shell 接口几乎不变
- 网络、端口转发规则不变

**把变化快的逻辑放在"控制平面"（agent），变化慢的放在"执行平面"（sandbox）**，这是经典的**关注点分离**。

### ③ 这个参考实现对独立开发者是利好，但有陷阱

**利好**：
- Vercel 写的 scaffold 质量高
- 直接 Deploy with Vercel 按钮一键部署
- 省去自己设计整个架构的时间

**陷阱**：
- **强依赖 Vercel 生态**（Workflow SDK 只在 Vercel 上跑；Sandbox 是 Vercel 独有）
- **锁定风险**：一旦深度使用，迁移到 AWS/GCP 几乎要重写
- **成本可能不透明**：Sandbox 按使用计费，一个 agent 跑复杂任务可能烧很多钱

**决策建议**：如果你要做 **"下一个 Cursor"**，这是值得 fork 的起点。如果你要做**消费端 AI 产品**（不需要 agent 跑代码），用它就是杀鸡用牛刀。

---

## 两个可以复用的工程要点

### 1. Snapshot-based Sandbox resume

> Sandboxes use a base snapshot, expose ports `3000, 5173, 4321, 8000`, and hibernate after inactivity.

**Snapshot 是 VM 可以"暂停再恢复"的关键**。不活跃时 hibernate（省成本），下次用户回来再恢复（保留工作状态）。

**对比**：每次打开都新建 VM = 每次都要重新 npm install + 重新 clone repo。用户体验差。

这个设计值得所有"给 agent 提供执行环境"的项目学习。

### 2. Agent 作为 Workflow，而非 Request

> Chat requests start a workflow run instead of executing the agent inline.
> Each agent turn can continue across many persisted workflow steps.
> Active runs can be resumed by reconnecting to the stream for the existing workflow.

**关键词：Workflow, Durable, Resume by reconnect**

这解决了 agent 最大的工程问题：
- Agent 跑 10 分钟，用户刷新浏览器 → 传统架构 agent 就挂了
- 有 workflow 持久化 → agent 继续跑，用户回来 reconnect 就行

**这个能力用普通 HTTP + Redis queue 能实现，但 Vercel Workflow SDK 把它变成了 framework 级原生支持**。

---

## 对我的启示

1. **如果我以后做 AI 产品，Workflow / Durable Execution 会是必选**。用户体验角度，"刷新就断"是上一代架构。新架构必须是"任务可以跨请求存活"。

2. **"Agent 大脑 + Sandbox 手脚"分离** 这个架构哲学，可以套到任何长期运行的 AI 任务：
   - 编程 agent → 代码 sandbox
   - 数据分析 agent → Jupyter sandbox
   - 视频制作 agent → ffmpeg sandbox
   - **都应该遵循"大脑和手脚分开"的原则**

3. **生态锁定的权衡**：Vercel 的 open-agents 很强，但绑定深。我自己做项目时会在开始时**刻意避免深度绑定任何单一平台**——保留"能换云商"的能力。这会让前期慢一点，但长期安全。

---

## 延伸：这预示着什么样的未来

**未来 12 个月会看到**：
- **AWS / GCP / Azure 各自推出类似"Bedrock Agents"的产品**（已经在做）
- **Cloudflare Workers 推出 agent workflow**（会）
- **各个云厂商都在抢 "agent 默认部署平台" 的位置**

**赢家**会是：
- **最低启动成本 + 最无感扩展 + 最透明计费** 的平台

**Vercel 有前两条，计费透明是它的弱点**（Vercel 在"成本超预期"方面口碑一般）。这是它能否赢的关键变量。

---

## 一个值得抄的小设计

README 里写的：
> repo is meant to be **forked and adapted**, not treated as a black box.

**不当黑盒，当模板**。这个话术我很喜欢。

很多开源项目追求"开箱即用"，反而限制了用户的 agency。Vercel 这个直接说"我给你一个起点，剩下你改"——反而降低了用户的期望，减少了售后压力，也让项目更有生命力。

**独立开发者开源项目可以学这个态度**：不是"我做得完美你只管用"，而是"我给你个 80 分的模板，你往 100 分改"。
