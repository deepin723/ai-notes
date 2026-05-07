---
id: note_1746666600000_anthropic_fsi
type: raw
title: "05.08 · anthropics/financial-services：Anthropic 亲手下场做垂直 Agent，这是个信号"
tags:
  - GitHub
  - Anthropic
  - AI Agent
  - 金融
  - 垂直应用
links: []
space: 日报采编
date: '2026-05-08'
read: false
created: '2026-05-08T01:00:00.000Z'
updated: '2026-05-08T01:00:00.000Z'
---

项目地址：[github.com/anthropics/financial-services](https://github.com/anthropics/financial-services)
语言：Python
今日 ⭐：1,343 stars（累计 10k+）
**发布方：Anthropic 官方**

---

## 核心定位

这不是社区作品，是 **Anthropic 亲自下场**做的垂直 Agent 合集。面向金融服务行业的四个场景：
- **Investment banking**（投行）
- **Equity research**（股票研究）
- **Private equity**（私募股权）
- **Wealth management**（财富管理）

每个 Agent 两种部署方式：
1. **Claude Cowork plugin** - 装到 Claude 的协作工具里直接用
2. **Claude Managed Agents API** - 通过 `/v1/agents` 端点部署到自己的工作流引擎

**同一套 system prompt + 同一套 skills，两种部署路径**。这个设计本身就值得细看。

---

## 具体做了哪些 Agent

| 分类 | Agent | 做什么 |
|---|---|---|
| **覆盖 & 顾问** | **Pitch Agent** | Comps / Precedents / LBO → 品牌 pitch deck |
| | **Meeting Prep Agent** | 客户会议前的 briefing pack |
| **研究 & 建模** | **Market Researcher** | 行业主题 → 竞争格局 / 同业比对 / 投资想法 shortlist |
| | **Earnings Reviewer** | 财报电话会 + 披露 → 模型更新 → 研究笔记 |
| | **Model Builder** | DCF / LBO / 三表 / 同业比对（活在 Excel 里） |
| **基金运营 & 财务** | **Valuation Reviewer** | GP 材料 → 估值模板 → LP 报告 |
| | **GL Reconciler** | 找出账目差异 → 根因追溯 → 路由签字 |
| | **Month-End Closer** | 应计 / 滚动 / 差异说明 |
| | **Statement Auditor** | 审计 LP statement |
| **运营 & 入场** | **KYC Screener** | 解析入场文档 → 规则引擎 → 标记缺口 |

**9 个 Agent，覆盖金融机构里一个分析师从早到晚的工作**。

---

## 这个项目值得关注的几件事

### 1. Anthropic 自己做垂直 Agent，是一个战略转向信号

过去 Anthropic 的定位：**基础模型 + API + 推到第三方开发者生态**。
现在这个仓库：**自己下场做应用级产品**。

这意味着：
- Anthropic 不只卖 Claude 的调用费，还要**卖"专业场景的现成方案"**
- 跟已经做金融 AI 的创业公司**直接竞争**（如前面那篇笔记讲的 Dexter）
- 复制 OpenAI Enterprise 的路径，但用更结构化的方式

**重要观察**：README 里反复强调"投行业务工作流、分析师工作产品"。这完全不是"AI 公司"的话语，是**投行咨询公司的话语**。Anthropic 的 GTM（go-to-market）正在向传统企业服务靠拢。

### 2. "一套代码，两种部署" 是新的 agent 架构模式

```
agent.yaml / plugin.yaml
  ├─ 当做 Cowork plugin 加载 → 用户在 Claude 里直接调
  └─ 当做 Managed Agent 部署 → 企业的工作流引擎调 /v1/agents
```

这解决了一个过去很烦的问题：
- **研发想要 Cowork 那种交互式调试**
- **生产想要 API 可控、工作流编排、日志审计**

以前要维护两份代码（prompt engineering 代码 + production 代码）。现在**一个 YAML 配置 = 两种部署**。

这可能是未来所有 agent 生态的标配。

### 3. "human-in-the-loop" 不是口号，是设计哲学

READ 里有一段 IMPORTANT 警告：

> 本仓库任何内容不构成投资、法律、税务、会计建议。这些 agent 起草分析师工作产品——模型、备忘录、研究笔记、对账——**供合格专业人士审查**。它们**不做投资建议、不执行交易、不绑定风险、不过账、不批准 onboarding**；**每个输出都为人工签字准备**。

这段话非常重要。**Anthropic 明确把 agent 定义为"提高分析师效率的工具"，而不是"替代分析师的自动决策系统"**。

对比 OpenAI 那种"更自主的 agent"的定位，Anthropic 是更保守的——**但在金融/法律/医疗这种高风险领域，保守就是对的**。

---

## 我的判断

### ① Anthropic 在建立一种"咨询公司 + AI 公司"的混合模式

传统咨询公司（McKinsey、BCG）卖的是**方法论 + 专业人员**。
Anthropic 卖的开始是**模型 + API**。
**现在它要卖的是：方法论（system prompt）+ 专业工具（skills）+ 模型（Claude）的打包方案**。

这是把咨询公司的知识产品化。**以前 "一个投行分析师写 DCF 模型的过程" 是 know-how，现在它被编码成 skill 发布在 GitHub 上**。

### ② 对其他创业公司的影响：双刃

**好处**：Anthropic 提供了**参考实现**，别人可以 fork、改造、垂直化。降低了"做金融 agent"的入场门槛。

**坏处**：Anthropic 官方亲自下场做基础 agent，**"做一个标准 agent 然后卖"的商业模式被直接挤压**。创业公司要想活，必须：
- 做 Anthropic 不做的**小众/深度垂直**（某个国家的特定监管合规）
- 做 Anthropic 覆盖不到的**运营 / 分发 / 客户关系**
- 做**整合层**（把 Anthropic agent + 其他工具打包成完整解决方案）

简单的 "AI wrapper" 创业公司是这次最大的输家。

### ③ Managed Agents API 是 Anthropic 跟 OpenAI Assistants API 的对标

OpenAI 去年推出 Assistants API，主打"不用你管 state，我帮你管"。
Anthropic 现在的 Managed Agents API 是同一思路。

**区别**：OpenAI 的 Assistants 更偏 chat 场景，Anthropic 的 Managed Agents 更偏 workflow。前者是"对话机器人"，后者是"任务执行者"。

**预测**：Managed Agents 系列会成为 Anthropic 未来 2-3 年的主要收入来源之一。企业场景的 LLM 使用，从 "API 调用次数 × 单价" 变成 "Agent 执行次数 × 按 workflow 打包定价"。

---

## 对我的启示

### 实操层面

1. **看完这个仓库的结构和 system prompt 可以偷师**。即使我不是做金融 agent 的，"把一个工作流拆成 agent"的方法论是通用的。
2. **`managed-agent-cookbooks/` 目录值得仔细看**——它里面的 YAML 结构定义了"一个 agent 应该怎么描述"，是接下来行业的标准可能性之一。
3. **skills 目录下的 `/comps` `/dcf` `/earnings` 这些 slash command 的实现**，是高质量 prompt engineering 样例。

### 战略层面

1. **如果我要做垂直 AI 应用，避开金融**——Anthropic 自己下场了，规模 + 品牌都打不过。
2. **可以考虑的垂直领域**：法律（合规太严 Anthropic 短期不会碰）、医疗（同上）、特定地区/行业（中国 A 股分析、日本税务、东南亚跨境电商）、**小众工作流**（视频剪辑分析师、房产中介、独立音乐人）。
3. **"做好工具的分发"比"做好工具本身"更难**。Anthropic 有 Cowork 做分发，创业公司没有——这是真正的不对称。

---

## 延伸思考

**如果基础模型公司都开始做垂直应用，应用层创业公司的生存空间在哪里？**

三条可能的路：

1. **做"太细"而巨头看不上的细分**——每年 100 万美元规模的小市场，Anthropic 不会碰
2. **做"太深"而巨头做不动的事**——需要大量行业人脉、监管关系、数据积累的领域
3. **做"非 AI"的东西——AI 只是其中一层**——真正的产品是工作流、品牌、社区，AI 是实现手段

**最失败的路**：做一个通用 "AI 写邮件 / AI 写文档" 工具。这个层 Anthropic / OpenAI / Google 都会自己做。
