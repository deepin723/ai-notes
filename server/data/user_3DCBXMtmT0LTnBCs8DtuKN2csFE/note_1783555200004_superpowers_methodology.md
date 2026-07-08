---
id: note_1783555200004_superpowers_methodology
type: raw
title: "07.09 · obra/superpowers：AI 代理的苏格拉底式开发法，先对话再写代码"
tags:
  - GitHub
  - AI编程
  - Claude Code
  - 工程方法论
links: []
space: 日报采编
date: '2026-07-09'
read: false
created: '2026-07-09T10:00:00+08:00'
updated: '2026-07-09T10:00:00+08:00'
---

## 项目概览

**仓库**：obra/superpowers  
**今日 Star**：999  
**技术栈**：Shell（skill 文件集合）  
**定位**：一套完整的 AI 辅助软件开发方法论，打包为可安装的 agent skill

## 核心反直觉：先对话，再写代码

大多数人使用 Claude Code 的方式：写一段需求描述 → 让 AI 直接生成代码 → 反复修改。

superpowers 的方式：

1. **brainstorming skill 先激活**：代理不立刻写代码，而是通过苏格拉底式提问精炼你的想法。"你是要解决 A 还是 B？这个功能的边界条件是什么？你期望的错误处理行为是？" 对话结束后，需求比你原来提交的清晰得多。

2. **writing-plans skill 生成任务列表**：每个任务限定 2-5 分钟可完成，包含确切的文件路径、完整的代码、验证步骤。没有模糊的"然后处理边界情况"。

3. **using-git-worktrees**：设计确认后，为每个功能创建独立的 git worktree 分支，隔离开发上下文。

4. **subagent-driven-development**：每个任务派发给一个新鲜的子代理执行，完成后两阶段审查（规格符合性 → 代码质量），任何一阶段不通过则退回修改。

5. **test-driven-development 强制执行**：严格的 RED-GREEN-REFACTOR。在测试通过之前写的代码会被删掉重来，不允许跳过。

6. **requesting-code-review**：任务间触发代码审查，关键问题阻断进度直到解决。

7. **finishing-a-development-branch**：验证测试 → 选择 merge/PR/保留/丢弃 → 清理 worktree。

## 与 addyosmani/agent-skills 的区别

（07.07 已写过 agent-skills）

| | agent-skills | superpowers |
|---|---|---|
| 定位 | 工程生命周期各阶段的最佳实践规则集 | 完整的开发方法论，含设计到交付全流程 |
| 设计前置 | `/spec` 命令，可选 | brainstorming 强制前置，不写代码先对话 |
| 子代理架构 | 无，单代理执行 | subagent-driven，每任务独立子代理 |
| TDD | 包含 `/test` 命令 | 强制执行 RED-GREEN-REFACTOR，违反则删代码 |
| 哲学取向 | 工程规范的系统化 | 复杂度控制，任务拆解，证据导向 |

两者是互补关系，不是竞争。agent-skills 更像一套工程规范手册，superpowers 更像一套开发流程框架。

## 分发渠道

已进入 Anthropic 官方 Claude plugin marketplace（`/plugin install superpowers@claude-plugins-official`）、Codex App、Cursor、GitHub Copilot CLI、Factory Droid、OpenCode 等。

## 我的判断

这个项目的核心价值不在任何单个 skill，在于**"先对话再写代码"这个设计前置步骤**。

使用 AI coding agent 最常见的失败模式不是代码写错了，而是"写了很多但方向不对"。brainstorming skill 把这个问题在开始阶段就截断：当需求还模糊时，先用苏格拉底式提问压缩不确定性，再进入执行。

2-5 分钟的任务粒度是另一个重要设计选择。大任务的问题不只是难以审查，还在于代理在执行途中可以"偷偷"做很多隐式决定，等你看到结果时已经偏离了很多。小任务把每一步的决策显性化。

**对个人项目的实际意义**：如果你在用 Claude Code 做有一定规模的项目（超过几百行，有多个功能模块），superpowers 的流程比"直接丢需求给 AI"会少很多"大返工"。代价是开始时慢一点（需要经过 brainstorming 阶段），但长期节省的修改时间更多。

## 来源

GitHub Trending 日榜 #10（2026-07-09），今日 999 Stars。
