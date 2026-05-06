---
id: note_1746580300000_playwright_cli
type: raw
title: "05.06 · MCP 不是银弹：Playwright CLI 反而更适合 AI 浏览器自动化的真实场景"
tags:
  - AI工具
  - Playwright
  - MCP
  - 浏览器自动化
  - 工程实践
links: []
space: 日报采编
date: '2026-05-06'
read: false
created: '2026-05-06T23:24:00.000Z'
updated: '2026-05-06T23:24:00.000Z'
---

来源：掘金 · 作者：一个用 Codex + Playwright 做前端调试的开发者

---

## 核心观点（省流）

作者的经验非常接地气：

**Playwright MCP 听起来很酷，但在"让 AI 接管我现有的浏览器去调试本地项目"这种场景下，用 Playwright CLI 反而更干净可靠。**

原因不是 MCP 写得不好，是 **MCP 的设计假设和真实调试场景的假设不一致**。

---

## 具体痛点（作者遇到的）

作者的需求很简单：
> 让 AI 接管我当前已经打开的 Chrome，打开本地项目页面、点几个按钮、看一下 DOM、截个图。

走 MCP 的坑：
1. **经常新开一个独立浏览器**（不是我正在用的那个 Chrome）
2. **登录态不共享**（后台系统依赖 SSO/cookie/localStorage，MCP 的新浏览器全都没有）
3. **想复用当前浏览器页签很麻烦**
4. **截图可能截到另一个屏幕**（多屏幕环境下很常见）
5. **每个项目调试状态不一致**

走 CLI 的解法：
- `playwright-cli attach` 可以**挂到你现有的浏览器**上
- 登录态、cookie、扩展、插件——全都共享
- AI 用命令行调用，逻辑透明

---

## 这背后的设计哲学差异

这篇文章其实是在讲一个更大的问题：**MCP 和 CLI，哪个才是 AI 调用工具的"正确"接口**？

两种范式的核心区别：

| 维度 | MCP | CLI |
|------|-----|-----|
| 状态 | **进程化**（MCP 服务器持有浏览器实例） | **无状态**（每次调用都是独立命令） |
| 调试 | 调试 MCP 协议层比较黑盒 | 直接看命令和输出 |
| 复用用户环境 | 默认独立沙箱 | 天然可以 attach 到用户进程 |
| AI 集成 | 标准化，适合工具市场 | 要配置 skills/functions |
| 失败场景定位 | "是协议问题还是工具问题？" | `echo $?` + stderr 即可 |

**MCP 的优势是在"AI 需要调用一组陌生工具"时的标准化发现和调用**。但对于"我已经有一个工具 X，想让 AI 用它"，CLI 是更轻的选择。

---

## 作者没明说但值得补充的点

### 1. MCP 真正的价值在跨工具组合，不在单一工具

如果你只用一个 Playwright，CLI 够用。但如果你要让 AI 同时用 Playwright + Slack API + GitHub API + 本地 bash，MCP 的统一接口就开始有价值——**AI 不需要知道每个工具的 CLI 语法**。

### 2. 本地调试是 MCP 的反样本场景

MCP 假设工具提供方和使用方是分离的（服务器-客户端模型）。但本地前端调试的本质是："**工具就是我本机上的东西，我已经有登录态、浏览器、调试环境**"。

把本地环境"推进" MCP 的沙箱里，反而是走了弯路。

### 3. "attach 到现有进程"是被低估的能力

浏览器自动化框架（Puppeteer、Playwright）都支持 CDP `--remote-debugging-port` 连接到已打开的 Chrome。这个能力对**保留调试上下文**（登录态、已打开的页签、DevTools 状态）非常关键。

MCP 工具层包装时往往忽略这条路径，默认启一个干净浏览器。

---

## 我的判断

AI 工具化这两年有个过度扩张的倾向：**凡是工具，必上 MCP**。

但工具分两类：
- **提供新能力**的工具（天气、航班、数据库查询）——MCP 很合适
- **操纵用户已有资源**的工具（本地浏览器、本地 IDE、本地 git 仓库）——CLI 更合适

第二类工具的价值核心是**状态连续性**——你要继续用我的登录态、我的分支、我的断点。MCP 的进程隔离模型会破坏这种连续性。

这也是为什么 Claude Code、Cursor 这类"在你的机器上跑"的 AI 工具，基本都是用 Bash/Shell 调用而不是全面 MCP 化。

---

## 对我的启示

1. **选工具时问自己一个问题**：我要的是"AI 能调用这个工具"，还是"AI 能以我的身份继续我的工作流"？前者用 MCP，后者用 CLI + attach。

2. **别被 MCP 潮流裹挟**。如果一个任务用 `playwright-cli screenshot` 一行命令就搞定，就别包个 MCP 出来。**简单胜于标准**。

3. **`attach` 模式是所有本地 AI 工具应该默认支持的能力**。如果一个工具强制启新进程，它大概率不适合调试场景。

4. **实战可用的配置**（摘自原文，值得保留）：

```bash
# Node 18+
npm install -g @playwright/cli@latest

# 安装 skills（让 AI 能调用）
playwright-cli install --skills

# attach 到当前 Chrome
playwright-cli attach \
  --config chrome.config.json \
  --extension=chrome

# 接下来的调用都带 --session 复用
playwright-cli --session my-current-chrome goto "http://localhost:8080"
playwright-cli --session my-current-chrome snapshot
playwright-cli --session my-current-chrome screenshot
```

这个 pattern 明天就能用在我自己的 Browser-Harness 调试里——**session 化 + attach 模式**，值得借鉴。
