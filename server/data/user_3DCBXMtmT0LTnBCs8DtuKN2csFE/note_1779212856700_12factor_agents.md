---
id: note_1779212856700_12factor_agents
type: raw
title: "05.20 · 12-Factor Agents：构建可靠 LLM 应用的 12 条原则"
tags:
  - GitHub
  - AI工具
  - 架构设计
links: []
space: 日报采编
date: '2026-05-20'
read: false
created: '2026-05-20T01:48:07+08:00'
updated: '2026-05-20T01:48:07+08:00'
---

## 项目概况

**humanlayer/12-factor-agents** | TypeScript | 736 stars today | [github.com/humanlayer/12-factor-agents](https://github.com/humanlayer/12-factor-agents)

致敬经典的 [12 Factor App](https://12factor.net/)，为构建真正可用于生产环境的 LLM 应用提供 12 条原则。

## 核心洞察：Agent ≠ "prompt + tools + loop"

作者 Dex 跑遍了所有主流 Agent 框架（LangChain、CrewAI、LangGraph、smolagents、griptape...），和大量 YC 创始人聊过，发现：

> **真正好用的 AI Agent 不是"给个 prompt + 一袋工具 + 让它循环到目标"，而是主要由软件组成——在精准的关键节点插入 LLM 调用。**

市面上很多"AI Agent"产品，骨子里是确定性代码 + 少量 LLM 调用点的组合。这不是什么高级技巧——这就是能让产品真正到达用户手里的方式。

**没有主流 Agent 框架被大规模用于生产面向客户的产品**——大多数强大的团队都在自己搭栈。

## 12 条原则（部分）

原则清单仍在完善中，但已有实质内容的核心原则包括：

- **Factor 3: Context Engineering（上下文工程）**：被认为是最重要的因子，专门跳转链接。上下文不只是"塞进 prompt"，而是要设计信息的结构、时序和精确度。
- **精确的工具定义**：不是"给 Agent 所有工具"，而是在每个步骤只提供它需要的工具。
- **Human-in-the-Loop 节点**：可靠的 Agent 会在关键决策点暂停等待人类确认，而不是一路到底。
- **确定性代码优先**：能用 if/else 写的就用 if/else，LLM 只用在真正需要语义理解的地方。

还提供了 `npx/uvx create-12-factor-agent` 脚手架，可以快速生成符合原则的项目模板。

## 我的判断

这个项目的价值不在于"新技术"，而在于**把行业里隐性的工程共识显性化**——那些做出了好 AI 产品的团队，其实都在无意识地遵循这些原则。

**最重要的一条反直觉原则**：减少 Agent 的"自主性"往往能提高可靠性。不是"让 Agent 自己想办法"，而是"设计好确定性框架，在关键点调用 LLM 做判断"。

**对我的启示**：当前 Claude Code 的工作方式其实已经符合这些原则——大量确定性代码 + 精准 LLM 调用 + 人类审批关键动作。这不是偶然，是生产可用的 Agent 工程的必然路径。

如果你在构建 AI Agent 类产品，这份文档值得通读一遍。
