---
id: note_1746580600000_agent_skills
type: raw
title: "05.06 · addyosmani/agent-skills：Addy Osmani 做的 AI 编码工程化技能包，值得细看"
tags:
  - GitHub
  - AI Agent
  - Claude Code
  - 工程化
  - Skills
links: []
space: 日报采编
date: '2026-05-06'
read: false
created: '2026-05-06T23:30:00.000Z'
updated: '2026-05-06T23:30:00.000Z'
---

项目地址：[github.com/addyosmani/agent-skills](https://github.com/addyosmani/agent-skills)
作者：Addy Osmani（Google Chrome 团队，《Learning JavaScript Design Patterns》作者）
语言：Shell + Markdown
今日 ⭐：629 stars（累计 29.6k）

---

## 先说作者是谁：这个背景很重要

Addy Osmani 不是普通的开源作者。他是 Google Chrome 团队的核心人物，过去十年写过一系列影响巨大的前端工程内容：
- 《Learning JavaScript Design Patterns》
- PRPL pattern（Web 性能范式）
- JavaScript Bundling Best Practices
- Chrome DevTools 团队

**当他从 2026 年开始深度投入 AI Agent 工程化，并做出一个 GitHub 上 29k+ stars 的项目，值得认真看**。

---

## 项目的核心思路：把软件开发拆成 7 个阶段，每个阶段配一个 skill

```
DEFINE → PLAN → BUILD → VERIFY → REVIEW → SHIP
/spec   /plan  /build  /test    /review  /ship
```

每个阶段对应一个 slash command，背后是一套 Markdown 规范（skill）。

| 阶段 | 命令 | 核心原则 |
|------|------|----------|
| 定义要做什么 | `/spec` | **Spec before code** |
| 规划怎么做 | `/plan` | **Small, atomic tasks** |
| 渐进式构建 | `/build` | **One slice at a time** |
| 证明它工作 | `/test` | **Tests are proof** |
| 合并前审查 | `/review` | **Improve code health** |
| 简化代码 | `/code-simplify` | **Clarity over cleverness** |
| 发布到生产 | `/ship` | **Faster is safer** |

还有一些"自动激活"的 skills：
- 设计 API 时自动激活 `api-and-interface-design`
- 写前端时自动激活 `frontend-ui-engineering`
- 涉及性能时自动激活 `performance-engineering`

---

## 为什么这个项目值得关注

### 1. 它是对"AI 写代码"的一个重构

大多数人对 AI 写代码的态度还停留在"给 prompt → AI 生成 → 人类检查"。

Addy 的思路完全不同：**把优秀工程师的工作方法论显式化成可执行的阶段**，让 AI 按这个方法论走。

这类似于从"给实习生布置任务"升级到"把公司的 engineering handbook 直接塞给 AI"。

### 2. 它是"skill" 这个抽象的标杆

Anthropic 几个月前推出 Skills 概念，但真正做出一套高质量、跨项目可复用的 skills 库的，目前看 Addy 这个项目是第一梯队。

**skill 的本质**：
- **粒度比 system prompt 小**（一个 skill 专注一件事）
- **比函数调用大**（可以是一整套方法论 + 代码 + 检查清单）
- **可组合**（skill 之间能自动激活、协同）

这三点合起来，就是 Anthropic 想推广的"让 AI 代理有可复用的专业能力包"的核心。

### 3. 它隐含了一个判断

> **AI 不缺生成能力，缺的是工作方法论。**

现在的 GPT-5/Claude 4.7 级别模型，代码生成能力已经很强。瓶颈不在代码，在于：
- 要先写 spec 吗？spec 写到什么程度？
- 怎么拆任务？拆到多细？
- 什么时候该 test？跑哪种 test？
- review 的标准是什么？

**这些问题没有统一答案，每个团队的工程文化都不一样**。所以 Addy 把自己认为的"最佳实践"写成 skills，让 AI 强制按这套流程走。

结果是：即使你自己没想清楚要怎么工作，AI 会"倒逼"你按 Addy 的方法工作——**等于把 Google 的工程文化包装成了一个 npm 包**。

---

## 我最赞同的三条原则（从 README 推断）

### ① Spec before code

即使是小需求，先写一个 200 字的 spec（问题是什么、约束是什么、预期结果是什么），后面整个 AI 对话都基于这个 spec 跑。

**为什么重要**：没有 spec，AI 会顺着你的第一句 prompt 发散，越跑越偏。有 spec，AI 有"锚"。

### ② Small, atomic tasks

把计划拆成"一次只改一块代码"的小任务。每个任务完成后 commit + test。

**为什么重要**：AI 写代码的失败率跟任务大小成正比。原子化的任务有两个好处——失败时容易回滚、成功时容易复盘。

### ③ Faster is safer

这句话反直觉但深刻。传统观点是"越谨慎越安全"。

Addy 的观点是："**快速小步迭代 + 快速 rollback 能力 = 比慎重大改更安全**"。

因为：
- 小改动的 bug 影响面小
- 快速发布意味着 bug 更快被发现
- Rollback 能力是真正的安全保障

这跟 Jez Humble 的《Continuous Delivery》是一脉相承的。

---

## 我的判断

### 这个项目代表一个趋势：AI Agent 工程化的"最佳实践战争"开始了

过去半年，AI coding 的竞争在"模型能力"和"工具集成"。接下来 1-2 年，**真正的差异化来自"工作流和方法论的打包能力"**。

**证据**：
- OpenAI Swarm → 协作模式的 skills
- Anthropic Skills → 方法论的 skills
- Cursor Rules → 团队规范的 skills
- 这个 agent-skills 项目 → 软件工程方法论的 skills

所有的大 AI 公司都在追"**谁能把最好的工程文化打包给 AI**"。

### Addy Osmani 入场是一个信号

Addy 在前端工程社区的影响力不低于 Martin Fowler 在后端社区。他选择这个时间点 all-in AI Agent 工程化，是对这个方向"值得做"的强背书。

---

## 对我的启示

1. **skills 不是"给 AI 用的小工具"，是"把你的方法论显式化的机制"**。下次我做任何 AI 应用，第一件事是问：我要让 AI 按什么工作方法论工作？先写下来，再 prompt。

2. **把软件开发拆成 6-7 个阶段**（Addy 的拆法：spec/plan/build/test/review/ship）——这个拆法不完美，但**比"让 AI 一把写完"这种默认模式好 100 倍**。

3. **"自动激活"是 skills 系统比 system prompt 强的地方**。写前端时自动激活前端 skill，写 API 时自动激活 API skill——这意味着 AI 在不同任务里"拥有不同的大脑"。这个能力应该用到自己的项目里。

4. **skills 是一个可以卖的产品**。如果未来有人把"某某大厂的 engineering handbook"打包成 skills 发布，会有市场——因为它比课程更直接（能即时影响你 AI 的输出）。

---

## 一个实际 action

今晚我就可以做的事：把我自己开发 ai-notes 项目时反复要 AI 做的那些规则（比如"先说明改动原因""不要改超过一个文件""改完后必须本地验证"），写成几个 .md 文件放到 `.claude/skills/`。

**这跟每次口头叮嘱 AI 的区别在于**：skills 是持久的、可复用的、跨会话有效的——你教 AI 一次，它以后永远记得。
