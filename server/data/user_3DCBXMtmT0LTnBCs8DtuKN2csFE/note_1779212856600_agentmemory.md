---
id: note_1779212856600_agentmemory
type: raw
title: "05.20 · agentmemory：给 Claude Code / Cursor 装上持久记忆"
tags:
  - GitHub
  - AI工具
  - 开发效率
links: []
space: 日报采编
date: '2026-05-20'
read: false
created: '2026-05-20T01:48:06+08:00'
updated: '2026-05-20T01:48:06+08:00'
---

## 项目概况

**rohitg00/agentmemory** | TypeScript | 1,609 stars today | [github.com/rohitg00/agentmemory](https://github.com/rohitg00/agentmemory)

定位：基于实际 benchmark 的 #1 AI 编程 Agent 持久化记忆系统——解决"每次开新对话都要重新介绍项目背景"的问题。

## 核心问题

每次打开新的 Claude Code / Cursor 对话：
- 你需要重新解释项目架构
- Agent 不记得上次你说过"这个函数有已知 bug"
- 历史决策（为什么用 X 不用 Y）全部消失

agentmemory 的答案：本地运行一个记忆服务器，所有 Agent 共享同一份记忆。

## 技术方案

基于 Karpathy 的 LLM Wiki 模式，加入了：
- **confidence scoring**：记忆的可信度分级
- **knowledge graphs**：记忆之间的关系图
- **hybrid search**：语义 + 关键词混合检索
- **lifecycle management**：记忆的有效期和更新机制

```bash
# 安装和启动
npm install -g @agentmemory/agentmemory
agentmemory                      # 启动记忆服务器 :3111
agentmemory connect claude-code  # 接入 Claude Code
```

支持的 Agent：Claude Code（native plugin + 12 hooks + MCP）、Cursor（MCP）、Codex CLI（native plugin + 6 hooks）、Gemini CLI（MCP）、OpenHuman（内置后端）等 16+ 客户端。

所有 Agent 共享同一个记忆服务器——Claude Code 记住的东西，Cursor 也能查到。

## 我的判断

**解决的是真实痛点**：对重度使用 AI 编程工具的开发者来说，上下文丢失是效率杀手。长项目中，反复解释架构决策的成本非常高。

**设计的关键选择**：confidence scoring 很有意思——它承认记忆可能是错的，需要定期更新和验证，而不是把所有记忆都当作真理。这比简单的"存档+检索"更接近真实的记忆机制。

**对普通开发者的实际建议**：如果你是个人开发者且主要用 Claude Code，可以先从 CLAUDE.md（原生支持）开始——成本更低。agentmemory 更适合多工具混用、需要跨 Agent 共享上下文的场景。项目还在快速迭代，可以加入 watchlist。
