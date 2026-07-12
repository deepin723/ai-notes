---
id: note_1783814400003_stitch_skills
type: raw
title: "07.12 · Google Stitch Skills：跨 Agent 的设计工具 skills 标准"
tags:
  - GitHub
  - AI工具
  - Google
  - Agent
links: []
space: 日报采编
date: '2026-07-12'
read: false
created: '2026-07-12T10:10:00+08:00'
updated: '2026-07-12T10:10:00+08:00'
---

## 项目信息

- **仓库**：google-labs-code/stitch-skills
- **今日 Star**：340
- **语言**：TypeScript
- **定位**：为 Google Stitch 设计工具提供的 Agent Skills 集合，遵循 agentskills.io 开放标准

---

## Stitch 是什么？

Google Stitch 是 Google Labs 推出的 AI 辅助 UI 设计工具（stitch.withgoogle.com），类似于 Figma 的 AI 版本——通过自然语言描述生成和修改 UI 设计。

**stitch-skills** 是为 Stitch 创建的可复用工作流技能包，包含三类：
- **stitch-design**：设计相关的技能（布局、组件、样式）
- **stitch-build**：构建和组件相关技能
- **stitch-utilities**：辅助和工具类技能

---

## 关键技术：agentskills.io 开放标准

这个项目遵循的 [Agent Skills](https://agentskills.io) 开放标准值得单独关注。它的目标是：**让一套技能包可以跨多个 AI coding agent 使用**。

目前支持的 Agent：
- Claude Code（Anthropic）
- Codex（OpenAI）
- Gemini CLI（Google）
- Cursor
- Antigravity

安装方式：

```bash
# Claude Code
npx plugins add google-labs-code/stitch-skills --scope project --target claude-code

# Codex
codex plugin marketplace add google-labs-code/stitch-skills --ref main
```

这意味着 Google 在推进一个战略：**把 Stitch 的设计能力以"技能插件"的形式输出给所有主流 AI 编程工具**，而不是把用户锁在自己的工具链里。

---

## 为什么 340 星？

1. **Google 背书**：google-labs-code 官方 org 发布，自带信任背书
2. **跨 agent 兼容性**：打通了 Claude Code / Cursor / Codex 等多个热门工具，传播面广
3. **agentskills.io 标准**：这个开放标准本身正在获得关注，stitch-skills 是目前最高质量的参考实现

---

## 我的判断

这里有个隐藏的更大信号：**agentskills.io 开放标准本身比 stitch-skills 更重要**。

如果这个标准成立，意味着：
- AI coding agent 的功能扩展将从"每家自己造生态"走向"开放标准 + 可互操作的 skills 市场"
- 对于开发者：写一套技能，发布一次，所有主流 agent 都能用
- 对于 Google：通过标准制定影响整个生态，而不是靠锁定来获得份额

这和 MCP 在工具层的标准化有类似的逻辑——**协议层的胜者比应用层的胜者更持久**。

Google 把 stitch-skills 作为标准的"样板仓库"来推广，是典型的"通过高质量参考实现来推进标准落地"策略。

**但风险**：agentskills.io 目前支持的 agent 实际上都是由各自公司控制的，能否形成真正的开放标准，还要看各方是否愿意遵守。Anthropic 和 OpenAI 历史上在此类跨行业标准上配合意愿参差不齐。

---

## 对我的启示

- 关注 agentskills.io：这是一个可能成为"AI 工具技能市场"基础设施的标准
- Google 的策略是通过 Stitch + skills 标准在 AI 设计工具领域建立生态位，而不是靠封闭生态
- Claude Code 用户可以直接 `npx plugins add` 安装这些设计技能
