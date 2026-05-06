---
id: note_1746580500000_generative_ui
type: raw
title: "05.06 · 生成式 UI 不是炫技：Claude.ai 流式 HTML 渲染背后的三个真问题"
tags:
  - 生成式UI
  - Claude
  - 前端工程
  - LLM
  - 流式渲染
links: []
space: 日报采编
date: '2026-05-06'
read: false
created: '2026-05-06T23:28:00.000Z'
updated: '2026-05-06T23:28:00.000Z'
---

来源：掘金 · code进化论

---

## 这篇文章讲什么

很多人用过 Claude.ai 后发现一个现象：它能边输出边渲染出一个完整的交互式图表/表格/工具（不止是文本）。

这个能力叫 **Generative UI（生成式 UI）**——大模型直接输出 HTML/CSS/JS，前端流式渲染成可交互组件。

作者反推了 Claude.ai 的 SSE 消息格式，拆解出要做一个能用的生成式 UI 系统要解决的三个核心问题。

---

## 从 Claude.ai 的 SSE 数据里能看到什么

作者抓包的 SSE 流类似这样：

```
data: {"type":"content_block_delta","delta":{"partial_json":"\"\\n<div style=\\\"padding: 1rem"}}
data: {"type":"content_block_delta","delta":{"partial_json":" 0;\\\">\\n  <h2>2022 年..."}}
data: {"type":"content_block_delta","delta":{"partial_json":"</h2>..."}}
...
```

**关键观察**：
1. 每条 SSE 消息只输出一部分 HTML，**切割位置是随机的**（可能在属性中间、标签中间）
2. 输出顺序是 **style → content HTML → script**——符合 HTML 文档标准格式
3. 中间随时可能被打断

这三个观察点出了三个工程难题。

---

## 难题 1：流式但不可解析

当前流传到的内容可能是：

```html
<p style="font-size: 13
```

这不是合法 HTML。浏览器会尝试解析并容错——结果就是 **UI 闪烁、布局跳动**。

**解法**：
- **不能直接 innerHTML 写入**，需要**防抖 + 合法性检查**
- 作者提到的做法：维护一个"待渲染 buffer"，当检测到 buffer 末尾在一个"安全断点"（标签闭合、属性完整）时才 flush 到 DOM
- 另一种做法：流式收字，**只有当本轮出现完整的标签节点时才更新 DOM**

### 一个更巧的技巧

实际上，**Claude.ai 采用的是 iframe + 全量替换**策略：

```
每次 flush 时，用当前累积的完整 HTML 重建 iframe document
```

这看起来低效，但因为 iframe 跟宿主环境完全隔离，不会触发宿主 React 重渲染，实际体验反而更顺滑。

---

## 难题 2：样式约束

如果让大模型完全自由地写 CSS，结果会是：
- 跟宿主页面风格冲突
- 颜色/字体/圆角不统一
- 深色/浅色模式兼容性差
- 每次生成风格都不一样，没有品牌一致性

**Claude.ai 的做法**：通过 system prompt 给模型一套 **CSS 变量规范**：

```css
var(--color-background-secondary)
var(--color-text-secondary)
var(--border-radius-md)
```

模型被要求**只能用预定义变量**，不能硬编码颜色。渲染时宿主环境提供这些变量的值——深色模式用深色值，浅色模式用浅色值。

这是**从 prompt 层面的设计约束**，不是运行时过滤。

### 为什么这个点对工程人很重要

很多人做生成式 UI 第一版都踩一个坑：**让模型自由生成样式，结果风格五花八门**。正确做法是反过来——**先定义一个"受限的表达语言"**（design token + 允许的布局模式），然后要求模型在这个子集里发挥。

这跟做编译器的思路一样：**用类型系统约束可能的状态空间**。

---

## 难题 3：安全隔离

直接把 LLM 生成的 HTML 塞进主页面，是一个巨大的安全漏洞：
- XSS：如果用户的输入被反射进 HTML 上下文，LLM 可能误以为是模板占位符
- 访问 cookie/localStorage/主页 DOM
- 加载任意外部资源（`<script src="http://attacker.com/...">`）

**Claude.ai 的做法**：渲染到 **沙箱化的 iframe** 里：

```html
<iframe
  sandbox="allow-scripts"
  srcdoc="<动态 HTML>"
></iframe>
```

关键是 `sandbox` 属性：
- `allow-scripts`：允许执行 JS（不然很多交互组件没法跑）
- **没加 `allow-same-origin`**：这个 iframe 对 window.parent 是完全 same-origin 隔离的，拿不到主页 cookie

这样即使模型生成恶意代码，最坏也只能在 iframe 里作妖，碰不到宿主。

---

## 我的判断

### ① 生成式 UI 是真的下一代 UI 范式，不是噱头

看起来只是"让 AI 画一个图表"。实际上它解决的是一个更大的问题：**如何让 AI 输出超越文本的结构化信息**。

想想以下场景：
- 比较多个产品 → AI 直接生成对比表格
- 讲解函数 → AI 生成一个交互式代码调试器
- 数据分析 → AI 生成交互式图表，用户能缩放、钻取
- 教课 → AI 生成小练习题，用户直接在 chat 里答题

这些都不是文本能表达的。**生成式 UI 把"AI 输出"从 1D 语言扩展到 2D 界面**。

### ② 这会重塑一部分前端工作

如果未来 30% 的用户界面是 LLM 动态生成的，那很多固定页面的前端代码根本不需要写。

但另外 70% 的工作——**"建立生成式 UI 的护栏"**——是新的工作：
- 设计 token 系统
- 设计沙箱协议
- 设计"可信 HTML 子集"
- 做渲染层的 diff 和防抖

这是新的前端工程学。

### ③ 短期内大公司自己会做这套基础设施

Anthropic、OpenAI、Google 都会内化这部分能力。开源实现会跟上，但标准化（类似 MCP 之于工具调用）还需要 1-2 年。

---

## 对我的启示

1. **我要是做 AI 产品，生成式 UI 是 2026 必须考虑的能力**。不要再只把 AI 的输出当作 markdown 处理。

2. **核心工程点**：
   - **iframe + srcdoc + sandbox 是最简单可用的起点**
   - **限制模型只能用预定义 CSS 变量**（而不是自由写样式）
   - **流式渲染要容忍 HTML 半合法状态**
   - 不要直接 innerHTML，要走 shadow DOM / iframe

3. **"用 iframe 做 UI 沙箱"是老技术的新用法**。几年前 iframe 被各种 React 方案看不起，今天反而是 generative UI 的关键基础设施。**老技术经常以新姿态回归**。

4. **Prompt 工程的边界在扩张**：以前 system prompt 只约束"写什么内容"，现在要约束"用哪些 CSS 变量""HTML 的输出顺序""何时调用什么函数"——Prompt 正在变成一种**声明式编程语言**。

---

## 一个延伸思考

如果生成式 UI 普及，浏览器可能会出现一个新的 primitive：**`<llm-ui>` 元素**——原生支持流式接收 LLM 输出并渲染。

这不是异想天开。想想 `<video>` 标签当年也是为了解决流式视频渲染。**下一代 Web 标准里会有一个 `<llm-ui>` 吗？** 我赌 50% 概率，5 年内某个浏览器（可能是 Arc 或某个 Chromium fork）会先做出实验性的版本。
