---
id: note_1784477841000_ra_overview
type: concept
title: rust-analyzer 整体架构 · LSP + 增量计算 + 容错
tags:
  - rust-analyzer
  - LSP
  - IDE
  - Rust
links:
  - note_1784477842000_ra_salsa
  - note_1784477843000_ra_syntax_tree
  - note_1784477844000_ra_vs_rustc
space: rust-analyzer 原理
created: '2026-07-19T02:30:00.000Z'
updated: '2026-07-19T02:30:00.000Z'
---

> 这一篇是 [[note_1784477842000_ra_salsa]]、[[note_1784477843000_ra_syntax_tree]]、[[note_1784477844000_ra_vs_rustc]] 的总纲。建议先读这篇建立全景，再钻细节。

## 一、它到底是什么

**rust-analyzer（简称 r-a）是 Rust 语言的 LSP 实现**，现在是官方组件，装完 `rustup` 就有：

```sh
rustup component add rust-analyzer   # 我这次刚装的，1.97.0
rust-analyzer --version              # rust-analyzer 1.97.0
```

VSCode 里装的那个 "rust-analyzer" 扩展，本身只是个**前端壳**——它真正干的事是：把 rust-analyzer 这个二进制当**子进程**拉起来，通过 LSP 协议跟它通信。所以"懂 Rust"的是那个二进制，扩展只负责把编辑器事件翻译成 LSP 消息、把 LSP 返回的补全/诊断画到屏幕上。

## 二、为什么不能直接用 rustc 当 IDE 后端

理论上 `rustc` 最懂 Rust，为什么不直接让编辑器调 rustc？因为两者目标冲突：

| 维度 | rustc（编译器） | rust-analyzer（IDE） |
|------|----------------|----------------------|
| 首要目标 | **准确**——给出能上生产的正确编译结果 | **快**——每次按键 100ms 内响应 |
| 输入假设 | 代码基本是完整、正确的 | 代码正在写，**语法残缺、类型未填**是常态 |
| 失败行为 | 一个错误就停，严格 | **容错**——残缺代码也要尽量给补全 |
| 计算模式 | 一次性全量 | **增量**——只重算改动的部分 |
| borrow checker | 全套跑 | 部分跳过（太慢，且 IDE 不需要那么严） |

所以 r-a 自己实现了一套"够用、快、容错"的分析管线，**不直接复用 rustc 的代码**。这是它能毫秒响应的根本原因，也是 r-a 的诊断和 `cargo check` 偶尔对不上的根因——见 [[note_1784477844000_ra_vs_rustc]]。

## 三、LSP 协议：编辑器和 r-a 怎么对话

LSP（Language Server Protocol）是微软为 VSCode 设计、现已被几乎所有编辑器采纳的标准。本质就是**编辑器（client）和语言服务（server）之间的 JSON-RPC**，传输层在 r-a 里是子进程的 stdin/stdout。

```
VSCode 扩展 (client)                rust-analyzer (server, 子进程)
       │  ←─ stdin/stdout 上的 JSON-RPC ─→
       │
       ├─ textDocument/didOpen    "用户打开了 main.rs，内容是..."
       ├─ textDocument/didChange  "用户又敲了一个字符，新内容是..."
       ├─ textDocument/completion "光标在第 5 行第 10 列，给我补全建议"
       │                          → 返回 ["foo", "for", "format!"]
       ├─ textDocument/hover      "光标在 `Vec` 上，给我类型信息"
       │                          → 返回 "struct Vec<T, A: Allocator>"
       ├─ textDocument/definition "跳转到这个符号的定义"
       └─ ...
```

每条消息有个 `method` 名和 `params`。server 有两种返回：**request/response**（有问有答）和 **notification**（单向通知，比如"文件改了"）。

LSP 的好处是解耦：r-a 只实现一次 LSP，所有编辑器（VSCode / Neovim / Emacs / Zed / Fleet）都能用同一套能力。

## 四、r-a 内部架构

```
            ┌──────────────────────────────────────────┐
            │            LSP frontend                   │
            │  (把 JSON-RPC 翻译成内部调用，反之亦然)    │
            └────────────────┬─────────────────────────┘
                             │
        ┌────────────────────┴───────────────────────┐
        │              Analysis 层                   │
        │  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
        │  │  parse   │→ │   HIR    │→ │ 类型推断  │  │
        │  │(rowan CST)│  │(高层 IR) │  │ name res │  │
        │  └──────────┘  └──────────┘  └──────────┘  │
        │            全部挂在 Salsa 查询图上         │
        └────────────────────┬───────────────────────┘
                             │
        ┌──────────┬─────────┴──────────┬───────────┐
        ▼          ▼                      ▼           ▼
   ┌────────┐ ┌────────┐           ┌──────────┐ ┌──────────┐
   │ Cargo  │ │ 项目  │           │ flycheck │ │ proc-macro│
   │ 读取   │ │ 模型  │           │(cargo    │ │   srv     │
   │        │ │      │           │  check)  │ │           │
   └────────┘ └────────┘           └──────────┘ └──────────┘
```

各部分职责：

- **LSP frontend**：收消息、调内部查询、把结果序列化回 JSON-RPC。
- **parse / rowan CST**：源码 → 无损语法树。见 [[note_1784477843000_ra_syntax_tree]]。
- **HIR**（High-level IR）：在语法树之上抽象一层——把 `use` 解析成路径、把 `struct Foo` 注册成可被引用的条目、做宏展开后的规范化。IDE 关心的"这是个什么定义、它引用了谁"都靠这一层。
- **name resolution + 类型推断**：`x.foo()` 里的 `foo` 指向哪个 `impl`？`Vec<u8>` 还是 `Vec<&str>`？这层算。
- **Salsa**：把上面所有计算组织成一张**查询依赖图**，按需算、增量算、变了才重算。r-a 的心脏，见 [[note_1784477842000_ra_salsa]]。
- **Cargo 读取**：读 `Cargo.toml` 拿到 crate 图、依赖、feature，r-a 才知道"项目里有哪些 crate、依赖怎么连"。
- **flycheck**：r-a 自己的类型检查可能和 rustc 有出入，所以它**额外**起一个 `cargo check` 子进程，把 rustc 的真诊断也展示出来（就是编辑器里那一批红波浪线里"更准的那批"）。
- **proc-macro srv**：过程宏（`#[derive(...)]`、`macro_rules!` 之外的 `proc_macro`）需要实际编译运行，r-a 起一个轻量 server 来展开它们。

## 五、它提供的能力（日常用的那些）

| 能力 | LSP method | 你在编辑器里看到 |
|------|-----------|------------------|
| 补全 | `textDocument/completion` | 打 `.` 后弹方法列表 |
| 悬停信息 | `textDocument/hover` | 鼠标悬停看类型/文档 |
| 跳转定义 | `textDocument/definition` | Cmd+Click 跳到定义处 |
| 跳转引用 | `textDocument/references` | 找所有调用点 |
| 重命名 | `textDocument/rename` | 改名自动改所有引用 |
| 代码动作 | `textDocument/codeAction` | "填充 struct 字段"、"加 derive" |
| Inlay hints | `textDocument/inlayHint` | 类型标注、闭包参数名内联显示 |
| 诊断 | `textDocument/publishDiagnostics` | 红/黄波浪线 |
| 格式化 | `textDocument/formatting` | rustfmt 触发 |
| 结构搜索 | `textDocument/...` | 结构化查找替换（SSR） |

## 六、为什么把 r-a 当 Rust 学习对象

r-a 本身是一个**超大型、高质量、生产级 Rust 代码库**（百万行级），而且它解决的问题——增量计算、容错解析、查询调度——天然就是 Rust 擅长的场景（高性能、强类型、零开销抽象）。读它的源码能看到：

- 怎么用 trait + enum 建模一个复杂的领域（语法树、类型系统）；
- 怎么用 `Arc`/`Rc` 做不可变共享、避免 clone；
- 怎么用 Salsa 这类"领域驱动"的库组织大型项目；
- macro_rules 怎么用、proc-macro 怎么写。

> 但注意：**入门不建议从 r-a 读起**，它太大了。先把 Book 的所有权/生命周期/trait 基础打牢，再挑 r-a 里某一小块（比如 rowan 的树操作）精读。

## 七、一句话总结

r-a 是 Rust 的 **LSP 实现**，本质是"一个跑在子进程里、靠 stdin/stdout 收 JSON-RPC、用 Salsa 做增量计算、用 rowan 做容错解析的 Rust 服务"。它和 rustc 各管一头：rustc 管对、r-a 管快。你装的那个 VSCode 扩展只是个壳，真正干活的是这个二进制。
