---
id: note_1783382400003_agent_skills
type: raw
title: "07.07 · agent-skills：给 AI 编程代理装上生产级工程技能"
tags:
  - GitHub
  - AI编程
  - Claude Code
  - 开发效率
links: []
space: 日报采编
date: '2026-07-07'
read: false
created: '2026-07-07T10:00:00+08:00'
updated: '2026-07-07T10:00:00+08:00'
---

## 项目概览

**仓库**：addyosmani/agent-skills  
**今日 Star**：1,311  
**作者**：Addy Osmani（Chrome 工程师，《JavaScript 设计模式》作者）  
**定位**：为 AI coding agent 提供一套生产级的软件工程 slash-command 技能集

## 8 个核心技能

| 命令 | 职责 |
|---|---|
| `/spec` | 把模糊需求转化为清晰的技术规格文档 |
| `/plan` | 生成分阶段实现计划，含风险识别 |
| `/build` | 按规格执行代码生成，遵循已选技术栈 |
| `/test` | 生成对应的测试用例 |
| `/review` | 代码审查，指出 bug、安全问题、可读性问题 |
| `/webperf` | Web 性能分析与优化建议 |
| `/code-simplify` | 复杂度简化，去掉不必要的抽象 |
| `/ship` | 上线前检查清单 |

## 上下文感知激活

这个项目的设计亮点：技能会根据上下文**自动激活相关的专业知识模块**。

例如：
- 讨论 API 设计时，`api-and-interface-design` 知识模块自动加载
- 处理 UI 相关需求时，`frontend-ui-engineering` 模块加载
- 涉及安全相关代码时，安全 checklist 自动应用

这不是简单的 prompt 前缀堆叠，而是将工程领域的 best practice 以"按需加载"的方式注入到代理的上下文中，避免了把所有规则全部塞入 system prompt 导致的稀释问题。

## 安装方式

```bash
npx skills add addyosmani/agent-skills
```

支持 70+ AI coding agent：Claude Code、Cursor、Codex、GitHub Copilot CLI、Cline、Windsurf 等。安装会自动写入对应工具的配置文件（CLAUDE.md 或等价物）。

## 与 CLAUDE.md 的关系

这本质上是一套**结构化的 CLAUDE.md 模板**，区别在于：
1. 由工程领域专家（Addy Osmani 背景是性能优化、工程实践）设计，而不是用户自己摸索
2. 技能粒度划分合理，`/spec` → `/plan` → `/build` → `/test` → `/review` → `/ship` 对应工程交付的完整生命周期
3. 上下文感知激活减少 prompt 污染

## 我的判断

这个项目的价值在于把"如何让 AI 按工程规范工作"这个隐性知识**显性化、可安装化**。

以前这些规范存在于资深工程师的脑子里，或者散落在公司内部 wiki 里。现在它们可以打包成 `/review` 命令，让 AI 在每次代码审查时自动应用。

值得关注的是作者身份：Addy Osmani 在 Web 性能领域有很高的公信力，他的 `/webperf` skill 里的内容质量可以信赖。这不是随便某人写的通用规则。

**实际可用的结论**：对于个人项目或小团队，`/spec → /plan → /build → /review` 这条链路值得直接采用。与其花时间写自己的 CLAUDE.md，不如先用这套模板跑几次，再按照自己的需求裁剪。

局限：技能越丰富，加载上下文越多，单次对话的 token 成本越高。长时间的 Agent 任务里需要注意 context 管理。

## 来源

GitHub Trending 日榜 #4（2026-07-07），今日 1,311 Stars。
