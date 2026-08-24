---
id: note_1787504563005_hermes_agent
type: raw
title: "08.24 · Hermes Agent：会积累记忆和技能的个人Agent操作系统"
tags:
  - GitHub
  - AI Agent
  - 记忆系统
  - 自动化
  - Python
links: []
space: 日报采编
date: '2026-08-24'
read: false
created: '2026-08-24T01:02:48+08:00'
updated: '2026-08-24T01:02:48+08:00'
---

项目地址：[NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) · Python · 234.8k stars · 今日约 454 stars

## 它把“自我改进”做成了产品主线

Hermes Agent 是 Nous Research 的通用个人 Agent。它不绑定模型，可连接 Nous Portal、OpenRouter、OpenAI 或自建兼容端点；同一个 Gateway 能服务 CLI、Telegram、Discord、Slack、WhatsApp、Signal 等入口。更特别的是，它把记忆和 Skill 做成闭环：搜索历史对话、定期提醒自己沉淀知识、在复杂任务后创建 Skill，并在后续使用中继续修改。

除了聊天，它内置 cron 调度、40 多种工具、MCP、并行子 Agent 和七类终端后端，包括本地、Docker、SSH、Singularity、Modal、Daytona 与 Vercel Sandbox。Agent 还能编写通过 RPC 调工具的 Python 脚本，把多步管线压缩成较少上下文消耗的执行回合。

## 为什么它像“个人Agent操作系统”

Hermes 同时覆盖模型路由、工具、长期记忆、技能、自动化、消息分发与执行环境。用户在手机上发一条消息，任务可以在云端容器运行，结果再回到原聊天渠道；环境空闲时休眠，适合常驻但并非持续计算的个人自动化。

项目还支持生成和压缩 Agent trajectory，用于训练下一代工具调用模型。这意味着它既是终端产品，也是研究数据生产器。

## 我的判断

Hermes 展示了个人 Agent 走向长期使用所需的完整部件：跨会话记忆、能力沉淀、定时任务、多端入口和可迁移执行环境。单纯提高模型智力并不能替代这些系统能力。

最大风险也来自“闭环”。Agent 若能根据自己的历史自动创建和修改 Skill，错误习惯可能被反复强化；记忆、消息平台、终端和第三方模型连在一起，也显著扩大了密钥泄露、提示注入和越权执行的攻击面。项目宣称“唯一内置学习循环”更像市场语言，真正重要的是这些修改是否可审计、可版本化、可回滚。

## 对我的启示

自改进 Agent 不能只有学习机制，还要有治理机制：每次记忆和 Skill 变化都应留下 diff、来源、触发任务和验证结果；高权限工具默认隔离，跨渠道消息明确标注信任级别。只有这样，能力才能复利，而不是风险复利。
