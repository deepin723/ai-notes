---
id: note_1783382400001_ai_job_search
type: raw
title: "07.07 · ai-job-search：把 Claude Code 变成你的专属求职代理人"
tags:
  - GitHub
  - AI工具
  - Claude Code
  - 独立开发
links: []
space: 日报采编
date: '2026-07-07'
read: false
created: '2026-07-07T10:00:00+08:00'
updated: '2026-07-07T10:00:00+08:00'
---

## 项目概览

**仓库**：MadsLorentzen/ai-job-search  
**今日 Star**：2,402（GitHub Trending 日榜第一）  
**技术栈**：TypeScript  
**定位**：一个 Claude Code slash-command 框架，把 Claude Code 变成全自动的求职申请代理人

## 它做什么

工作流分三步，每步对应一个 slash command：

**`/setup`** — 填入你的个人资料（技能、经历、偏好）、LinkedIn URL、目标职位类型，框架把这些信息写入持久化 profile。

**`/scrape`** — 自动爬取 Jobindex、Jobnet、LinkedIn 等招聘平台，按你的 profile 评分每个职位的匹配度，过滤掉不相关的，输出有分数的职位列表。

**`/apply <url>`** — 输入一个具体职位 URL：
- 分析职位 JD，提取关键词和能力要求
- 对照你的 profile 找出匹配点和差距
- 调用「起草 → 审核」双 agent 流水线生成 LaTeX 格式的 CV 和 Cover Letter
- 做 ATS（招聘系统自动筛选）可解析性检查
- 输出定制化的申请材料

核心架构：drafter-reviewer 两个 agent 串联，drafter 生成初稿，reviewer 按岗位要求打分修改，迭代直到质量达标。

## 为什么今天大量关注

这个项目代表了一个正在成型的新方向：**把求职这件事从"手工劳动"变成"代理流水线"**。

以往定制化求职材料的痛点：每投一个职位都要手动修改 CV 和 Cover Letter，几十个字眼的调整消耗大量时间，质量还不稳定。

AI 解决了哪部分：文本生成本身（tailoring CV to JD）Claude 已经做得很好。这个项目的贡献是把"爬取 → 评分 → 生成 → 检查"打包成可复用的流程，降低了每次投递的摩擦。

**面向丹麦市场但设计可迁移**：scraping skill 是可以换掉的（作者明确说 country-agnostic core），其他国家的开发者可以替换 job portal skill 适配本地平台。

## 技术亮点

LaTeX CV 生成是比 Word/PDF 更高质量的路径：LaTeX 控制排版精度，ATS 通常对结构良好的 PDF 解析更友好。drafter-reviewer 双 agent 模式也是近期 Claude Code skill 生态里出现频率最高的质量保障模式之一（类似于代码的"生成 → 审查"循环）。

## 我的判断

这个项目最有价值的部分不是代码本身，而是它揭示的**工作流设计思路**：把一个高频但枯燥的任务（求职申请）分解成 scrape / score / apply 三个明确的 agent 节点，每个节点职责单一，可以独立升级。

对独立开发者的启示：这种"把 Claude Code 变成特定领域的自动化代理"的模式，在求职、销售拓客、竞品分析等领域都有类似的应用空间。关键是：定义清楚 input（profile + 目标）、流程（固定步骤）、output（可以直接用的材料）。

局限：自动生成的 CV 和 Cover Letter 在没有人工审查的情况下批量投递，可能会带来另一个问题——招聘方也会用 AI 批量筛选，双方互相"AI 对 AI"，真实的匹配效率未必提升。

## 来源

GitHub Trending 日榜 #1（2026-07-07），今日 2,402 Stars。
