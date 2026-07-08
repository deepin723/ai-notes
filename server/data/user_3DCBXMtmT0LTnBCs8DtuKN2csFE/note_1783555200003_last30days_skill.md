---
id: note_1783555200003_last30days_skill
type: raw
title: "07.09 · last30days-skill：跨平台真实信号聚合，Polymarket 出价比推文更值钱"
tags:
  - GitHub
  - AI工具
  - Claude Code
  - 信息工具
links: []
space: 日报采编
date: '2026-07-09'
read: false
created: '2026-07-09T10:00:00+08:00'
updated: '2026-07-09T10:00:00+08:00'
---

## 项目概览

**仓库**：mvanhorn/last30days-skill  
**今日 Star**：373  
**技术栈**：Python  
**定位**：AI 代理技能，在 Reddit / X / YouTube / HN / Polymarket 等平台并行搜索，按真实互动加权综合

## 核心设计思路

每个信息平台都有盲区：
- **Google**：偏向编辑内容、SEO 优化的页面，PR 稿排前面
- **Reddit**：实时反应，但话题碎片化，难以跨版块整合
- **X**：第一手信息，但信噪比低，真实专家和噪音混在一起
- **YouTube**：深度内容，但没法搜索视频内部的具体句子

last30days-skill 的方案：**用 AI 代理同时调用所有平台，对结果按真实互动加权，去掉 PR 层只留真实信号**。

## 信号源和权重逻辑

| 平台 | 信号类型 | 权重来源 |
|---|---|---|
| Reddit | 上千个版块的帖子和评论 | Upvote 数（群体验证） |
| X | 推文、长文、专家线程 | 互动数；Digg AI 1000 精选账号 |
| YouTube | 视频全文转录 | 提取5个最具代表性的引用句 |
| Polymarket | 预测市场赔率 | **真实资金押注**，而非情绪表达 |
| Hacker News | 技术社区讨论 | 积分数（开发者共识） |
| TikTok/Instagram | 短视频和图文 | 文化相关性信号 |
| GitHub | 仓库和讨论 | Star/fork/issue 数 |

Polymarket 是这里最反直觉的源——它不是情绪，是真金白银的赔率。当 Polymarket 的赔率和 Twitter 上的多数情绪相反时，通常 Polymarket 更接近实际结果。

## 使用场景

**会议前研究**：`last30days_skill("John Smith CEO at TechCorp")` → 代理自动读取目标人物过去 30 天在 X 上的所有帖子、YouTube 访谈转录、关于他公司的 Reddit 讨论，会前完整背景一键生成。

**竞品分析**：`last30days_skill("Cursor vs Claude Code user sentiment")` → 抓取两个产品的 Reddit 对比帖、HN 讨论、X 上的开发者反应，按互动量排序，真实用户声音而非官方博客。

**市场信号**：`last30days_skill("NVDA earnings expectations")` → Polymarket 赔率、Reddit r/investing 讨论、X 上分析师线程的综合，而不只是 Google 新闻前5条。

**内容转笔记**：把 YouTube 播放列表转为可搜索的笔记库，只保留视频里最有价值的5个引用句。

## 安装

```bash
# Claude Code marketplace 或
npx skills add mvanhorn/last30days-skill -g
# 安装后 /last30days_skill "topic or person" 直接调用
```

Reddit / HN / Polymarket / GitHub 零配置；X / YouTube / TikTok 需要 30 秒 key 配置。

## 我的判断

这个工具击中了一个越来越尖锐的需求：**信息过载时代，真实信号和噪音的分离**。

Polymarket 作为权重源是最有深度的设计选择。信息市场的赔率整合了所有参与者的私有信息——当 Polymarket 的 Fed 加息赔率和 Twitter 上"75%的人觉得不加"相反时，应该更信任真钱。这个工具把这个逻辑系统化了。

局限：X 的 API 成本在 2024 年后大幅上涨，TikTok 的访问也受地区限制。实际使用时哪些平台有效取决于你的 API 配置，不是所有源都会同时生效。

**实际可用的结论**：最有价值的单一用法是**投资研究**——在做个股决策前运行一次 `last30days_skill("公司名 earnings")` 聚合 Polymarket + Reddit + X 的真实反应，比只看 Yahoo Finance 的新闻列表更接近市场真实情绪。

## 来源

GitHub Trending 日榜 #6（2026-07-09），今日 373 Stars。
