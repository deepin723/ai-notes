---
id: note_1779212856400_rust_tauri_rn
type: raw
title: "05.20 · 一套 Rust 核心跑通 Tauri + React Native：跨端架构实战"
tags:
  - 技术实践
  - Rust
  - 跨端开发
links: []
space: 日报采编
date: '2026-05-20'
read: false
created: '2026-05-20T01:48:04+08:00'
updated: '2026-05-20T01:48:04+08:00'
---

## 项目背景

SwarmNote 是一个跨端笔记应用，作者在反复试错后，找到了一套不需要在各平台重写业务逻辑的架构方案。

## 核心架构：三层分离

```
产品界面层：桌面 = React + Tauri WebView │ 移动 = Expo + React Native
平台适配层：桌面 = #[tauri::command] │ 移动 = uniffi-bindgen-react-native 生成 JSI/Turbo Module
共享核心层：swarmnote-core（平台无关的 Rust crate）
             ├── 工作区、文档 CRUD
             ├── Yjs/yrs 状态同步
             └── P2P 配对（libp2p：mDNS / DHT / DCUtR / GossipSub）
```

桌面和移动不是两个产品，是同一个 Rust 核心外面套了两个不同的壳。

## 为什么不是"Tauri 跑全端"

最诱人的答案是：Tauri v2 既支持桌面又支持移动，一套 Web + Rust 走到底。但现实打脸：

| 维度 | Tauri mobile | React Native |
|------|-------------|--------------|
| 移动端 UI 手感 | WebView 为主，手势/键盘/安全区需自己处理 | 原生视图，体验更自然 |
| 生态 | 较薄 | Expo/RN 生态完整 |
| Rust 调用 | WebView IPC，JSON 序列化 | JSI 直调 C++/Rust 绑定 |
| 复杂文件系统 | Android SAF/MediaStore 处理困难 | 有成熟方案 |

结论：**"能跑起来"和"适合长期做移动产品"是两件事**。移动端 UI 交给 RN，Rust 核心复用，是务实选择。

## 技术亮点

**UniFFI 生成 RN 绑定**：`uniffi-bindgen-react-native` 自动生成 TypeScript + C++ 绑定，从 Rust 直接暴露类型安全的接口给 RN——不是 JSON 序列化，是 JSI 直调，零额外序列化开销。

**P2P 在 Rust core 里**：用 libp2p 实现的点对点同步运行在 `swarm-p2p-core` 里，桌面和移动共享同一份 P2P 实现，不需要各写一遍。

**CodeMirror 6 在移动端**：移动端也需要代码编辑器体验，方案是在 RN 里嵌入一个 WebView，用 Comlink 让 RN 和 WebView 里的 CodeMirror 通信。

## 我的判断

这套架构的核心洞察：**把"平台差异"隔离在 platform trait 里，让业务逻辑只依赖 trait，不依赖具体平台**。Rust 的 trait 系统天然适合做这种抽象。

适用场景：需要桌面 + 移动双端、有复杂业务逻辑（P2P 同步、加密、本地计算）、性能要求高的应用。如果你的核心逻辑是纯 CRUD + API 调用，可能不值得引入这层复杂度。

**实际可用的结论**：下次做跨端项目时，先问自己"业务核心逻辑能不能用 Rust 写"——如果能，UniFFI 提供了一条代价不高的共享路径。
