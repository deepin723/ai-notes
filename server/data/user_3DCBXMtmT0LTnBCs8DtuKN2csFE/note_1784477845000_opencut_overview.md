---
id: note_1784477845000_opencut_overview
type: summary
title: OpenCut 重写版 · 整体结构鸟瞰
tags:
  - OpenCut
  - monorepo
  - proto
  - moon
  - 架构
links:
  - note_1784477846000_opencut_web
  - note_1784477847000_opencut_desktop
  - note_1784477848000_opencut_devtooling
space: OpenCut 项目
created: '2026-07-19T02:35:00.000Z'
updated: '2026-07-19T02:35:00.000Z'
---

> 这是 OpenCut 项目笔记的总纲，先用这篇建全景，再读 [[note_1784477846000_opencut_web]]、[[note_1784477847000_opencut_desktop]]、[[note_1784477848000_opencut_devtooling]]。

## 一、项目是什么

**OpenCut** 是一个**免费开源的视频编辑器**，定位对标 CapCut / Premiere，主打 web + desktop + mobile 多端。MIT 协议，社区驱动（Discord）。

我手上的 `~/Documents/OpenCut-main` 是它的**重写版**——README 开篇就说清了：

> **OpenCut is being rewritten from the ground up.**

重写的目标是这套：

- Editor API
- 第三方插件系统（plugin-first 架构）
- **Rust core**，一套代码出 desktop / mobile / browser
- MCP server（给 AI agent 用）
- Headless 模式（自动化、批量渲染）
- 编辑器内置脚本 tab

README 同时明说：**当前能用的版本是旧版 `opencut-classic`**，重写版还在搭骨架、**不接收外部贡献**。`opencut.app` 跑的还是 classic，重写版将来上 `new.opencut.app`。

> 结论先放这：**这是个"绝佳的学习项目"，但目前不是"能用的产品"**。学架构、学工具链、学 Rust + 前端工程非常合适，但别指望它能剪视频。

## 二、Monorepo 结构

```
OpenCut-main/
├── .prototools           # pin 工具版本：moon 2.3.3 / bun 1.3.11 / rust 1.97.0
├── .moon/
│   ├── workspace.yml     # 声明 apps/* 都是 project
│   └── toolchains.yml    # JS 用 bun、Rust toolchain 配置
├── bunfig.toml           # bun 配置（minimumReleaseAge=7d）
├── Cargo.toml            # Rust workspace 根（members: apps/desktop）
└── apps/
    ├── web/              # 前端（Vite + React + TanStack Start + Cloudflare）
    ├── api/              # API（Cloudflare Workers + Elysia）
    └── desktop/          # 桌面（Rust + gpui）
```

三个 app 一个表：

| App | 语言/栈 | 运行入口 | 现状 |
|-----|---------|----------|------|
| `apps/web` | TS · Vite 8 · React 19 · TanStack Start (SSR) · Cloudflare · Tailwind 4 · shadcn | `bun run dev` → :5173 | **能跑**，但路由只有 "hello world!" |
| `apps/api` | TS · Elysia · Cloudflare Workers | `wrangler dev` → :8787 | 骨架，三个路由 `/` `/health` `/echo` |
| `apps/desktop` | Rust · gpui (Zed 的 UI 框架) | `cargo run` | **编不过**（见 desktop 笔记），需完整 Xcode |

## 三、工具链：proto + moon

OpenCut 用 **proto**（moonrepo 出的版本管理器）把工具版本钉死在 `.prototools`，再用 **moon** 当任务运行器。这是 moonrepo 生态的一套"统一工具链"方案。

```toml
# .prototools
moon = "2.3.3"
bun  = "1.3.11"
rust = "1.97.0"
```

```yaml
# .moon/toolchains.yml
javascript:
  packageManager: 'bun'
bun:
  version: '1.3.11'
rust: {}
```

```yaml
# .moon/workspace.yml
projects:
  - 'apps/*'          # 自动发现 apps/ 下每个子目录为一个 project
```

每个 app 里还有自己的 `moon.yml`，声明 task，例如 web 的：

```yaml
# apps/web/moon.yml
tasks:
  dev:    { command: 'bun run dev' }
  build:  { command: 'bun run build' }
  test:   { command: 'bun run test' }
```

所以 README 给的运行命令是：

```sh
proto use           # 按 .prototools 装 moon/bun/rust 指定版本
moon run web:dev    # localhost:5173
moon run api:dev    # localhost:8787
moon run desktop:dev
```

> **但实际上我这台机走不通 proto 路径**（GitHub 被墙，`proto use` 拉版本清单失败），最后绕过去直接装 bun + rust，用 `bun run dev` 代替 `moon run web:dev`。详见 [[note_1784477848000_opencut_devtooling]]。

## 四、Rust workspace（desktop）

根 `Cargo.toml` 是个 workspace：

```toml
[workspace]
resolver = "3"
members = ['apps/desktop']

[workspace.package]
version = "0.1.0"
edition = "2024"        # 用 2024 edition
license = "MIT"

[workspace.dependencies]
gpui = "0.2.2"          # Zed 的 UI 框架
```

desktop crate 里引用 `gpui = { workspace = true }`——这是 Rust workspace 共享依赖版本的标准写法。edition 2024 是最新版。详见 [[note_1784477847000_opencut_desktop]]。

## 五、判断"项目处于什么阶段"

几个证据交叉验证：

1. README 自述"正在重写、不接收外部贡献"。
2. web 首页 `apps/web/src/routes/index.tsx` 内容就一行 `hello world!`。
3. api 只有 `/`、`/health`、`/echo` 三个探活路由。
4. desktop `main.rs` 是个 50 行的 gpui 窗口，文字写 "desktop shell scaffold"（桌面外壳脚手架）。
5. README 列的重写目标（MCP server、headless、plugin、scripting tab）在代码里**都还没出现**。

> 综合判断：**架构骨架刚搭起来，三个 app 各占一个"平台位"（web/api/desktop），功能几乎为零。** 正是看架构、学"一个跨端项目怎么从零组织"的好时机。

## 六、它为什么是好学习项目

- **跨端 monorepo**：web (TS) + api (TS) + desktop (Rust) 三种语言栈并存，能看"一个产品怎么拆成多端"。
- **工具链现代**：proto/moon/bun/wrangler/Tailwind 4/React 19/Vite 8/edition 2024，全是 2026 的前沿选型，跟着走一遍能摸一遍生态。
- **Rust 入门友好量级**：desktop crate 极小（一个 main.rs），但依赖的 gpui 是个大型真实库，能"小项目里见大库"。
- **官方背书的工程范式**：moonrepo 的 proto/moon 是"工具链可复现"的正经方案，值得学。

## 七、笔记地图

- 想看前端怎么搭 → [[note_1784477846000_opencut_web]]
- 想看 Rust desktop 为什么编不过 / gpui 是什么 → [[note_1784477847000_opencut_desktop]]
- 想看这台机怎么把环境装起来的（镜像/墙） → [[note_1784477848000_opencut_devtooling]]
- 想深入 r-a 本身（工具链里装的那个 rust-analyzer） → [[note_1784477841000_ra_overview]]

## 八、一句话总结

OpenCut 重写版是个**骨架阶段的跨端 monorepo**：proto 钉版本、moon 跑任务、三个 app 分占 web(TS)/api(TS)/desktop(Rust)。功能几乎为零，但架构选型前沿、结构清晰，是学工程组织和工具链的好标本——不是能用的产品。
