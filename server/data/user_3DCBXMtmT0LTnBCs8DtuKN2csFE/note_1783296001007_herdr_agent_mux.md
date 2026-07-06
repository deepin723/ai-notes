---
id: note_1783296001007_herdr_agent_mux
type: raw
title: "07.06 · Herdr：为 AI 编程代理打造的终端复用器"
tags:
  - GitHub
  - AI工具
  - 开发效率
  - Rust
links: []
space: 日报采编
date: '2026-07-06'
read: false
created: '2026-07-06T10:00:00+08:00'
updated: '2026-07-06T10:00:00+08:00'
---

## 项目概览

**仓库**：ogulcancelik/herdr  
**今日 Star**：783  
**技术栈**：Rust  
**定位**："在终端里管理所有 AI 编程代理"——tmux 为 Agent 时代的重建版

## 解决什么问题

同时跑多个 AI coding agent（比如在不同功能分支上并行开 Claude Code、Codex）时，terminal 管理是个真实的痛点：
- tmux 可以分屏，但对 Agent 的状态没有任何感知（不知道谁在工作、谁在等待输入、谁卡住了）
- GUI 管理工具（如 Conductor、cmux）无法在 SSH 远程环境里用
- 标准终端打开一堆 tab，状态全靠自己记忆

Herdr 的核心差异点：**侧边栏实时显示每个 agent 的状态**：
- 🔴 红色 = 被阻塞（等待用户输入）
- 🟡 黄色 = 工作中
- 🔵 蓝色 = 已完成
- ⚪ 灰色 = 空闲

## 技术特性

**安装**：单个 ~10MB Rust 静态二进制，无依赖，无需安装 runtime。

```bash
curl -fsSL https://herdr.dev/install.sh | sh
# 或通过 brew / mise / nix
```

**核心设计原则**：
- 每个 agent 拥有**真正的终端**（real PTY），不是模拟输出——这意味着全屏 TUI 程序（比如 Claude Code 的界面）可以正确渲染
- 后台服务器架构：关掉终端窗口不会杀掉任何 agent，SSH 重连后可以恢复
- 本地 socket API + CLI：agent 可以通过脚本驱动 herdr（创建工作区、分割面板、启动子代理）
- 零配置：无需 hook、无需配置文件即可启动

**支持的 Agent**：Claude Code、OpenAI Codex、Amp、Cursor、GitHub Copilot CLI、Devin 等14+个 agent，各自有状态识别规则。

## 与 tmux 的区别

| 特性 | tmux | herdr |
|---|---|---|
| 终端复用 | ✓ | ✓ |
| Agent 状态感知 | ✗ | ✓ |
| 侧边栏 fleet 视图 | ✗ | ✓ |
| SSH 远程可用 | ✓ | ✓ |
| 跨 agent 脚本 API | ✗ | ✓ |

## 我的判断

这个工具出现的时机正好：多 Agent 并行工作流（一个 agent 做重构、一个 agent 做测试、一个 agent 做文档）正在从"少数人的实验"变成"越来越多开发者的日常"。

但目前的状态感知主要基于对 agent 输出文本的模式匹配（判断是否在等待输入、是否完成），对不同 agent 的适配规则需要持续维护。随着各 agent 工具更新输出格式，这部分可能会有漂移。

Herdr 的定位是"基础设施原语"而非"完整解决方案"——它解决的是"我在哪个 pane 里，谁在做什么"的可见性问题，不解决 agent 间任务协调、结果合并等更高层的问题。

**实际可用的结论**：如果你经常同时开2个以上的 Claude Code 或 Codex 会话，herdr 的安装成本极低（10MB 单二进制），试用代价几乎为零。状态侧边栏那个设计确实有用。

## 来源

GitHub Trending 日榜 #9（2026-07-06），今日 783 Stars。
