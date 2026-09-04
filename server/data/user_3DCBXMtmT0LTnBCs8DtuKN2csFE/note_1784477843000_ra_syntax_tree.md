---
id: note_1784477843000_ra_syntax_tree
type: concept
title: rowan · 无损语法树与红绿树
tags:
  - rust-analyzer
  - rowan
  - CST
  - 红绿树
  - parser
  - Rust
links:
  - note_1784477841000_ra_overview
  - note_1784477842000_ra_salsa
space: rust-analyzer 原理
created: '2026-07-19T02:32:00.000Z'
updated: '2026-07-19T02:32:00.000Z'
---

> 这篇讲 rust-analyzer 把源码变成什么数据结构——`rowan` 的 CST。属于 [[note_1784477841000_ra_overview]] 里"parse"那一步。

## 一、为什么不用传统 AST

传统 AST（抽象语法树）的设计目标是"语法正确时给出一个干净的语义结构"，代价是**丢弃信息**：注释、空白、token 的精确位置都没了，连"用户写的代码长什么样"都还原不回来。

对编译器无所谓——它要的是语义。但对 IDE 是致命的：

- 格式化、重命名后要能**精确改回原文件**，不能丢一个字符；
- 诊断要能指到"第 5 行第 3 列"，需要 token 位置；
- 代码补全要理解**残缺的、语法错误的**代码——用户正在写，当然不完整。

所以 r-a 需要一种**保留一切信息**的树，叫 **CST（Concrete Syntax Tree，无损语法树）**。`rowan` 就是它用的 CST 库。

## 二、CST 长什么样

CST 的节点有两类：

- **内部节点（node）**：有子节点的结构，比如 `Fn`、`Expr`、`Stmt`。
- **叶子节点（token）**：不可再分的词法单元，比如 `fn`、`{`、标识符、空白、注释。

关键区别于 AST：**空白、注释、标点都是一等 token**，全保留。

举个最小例子，源码：

```rust
fn main() { let x = 1; }
```

它的 CST 大致结构（简化）：

```
FN (node)
├── FN_KW (token) "fn"
├── WHITESPACE (token) " "
├── NAME (token) "main"
├── PARAM_LIST (node)
│   ├── L_PAREN (token) "("
│   └── R_PAREN (token) ")"
├── WHITESPACE (token) " "
└── BLOCK_EXPR (node)
    ├── L_BRACE (token) "{"
    ├── WHITESPACE (token) " "
    ├── LET_STMT (node)
    │   ├── LET_KW "let"
    │   ├── WHITESPACE " "
    │   ├── NAME "x"
    │   ├── WHITESPACE " "
    │   ├── EQ "="
    │   ├── WHITESPACE " "
    │   ├── LITERAL "1"
    │   └── SEMICOLON ";"
    ├── WHITESPACE " "
    └── R_BRACE "}"
```

注意 `WHITESPACE` 全在树里。这棵树**能 100% 还原原始字符串**，这是 AST 做不到的。

## 三、红绿树（red-green tree）

`rowan` 实现的是 Roslyn（C# 编译器）发明的 **red-green tree**，目的是在"频繁小改"的场景下高效复用内存。

核心矛盾：CST 是不可变的（为了安全共享 + 增量计算，见 [[note_1784477842000_ra_salsa]]），但用户每敲一个字都要变。如果每次改动都重建整棵树，内存和 CPU 都浪费。

红绿树的设计：

- **绿色层（Green）**：不可变、可共享的内部表示，**按结构相等去重**——两个内容相同的子树只存一份。
- **红色层（Red，即 SyntaxNode）**：绿色节点上包一层，加上"我在父节点里的位置 / 我属于哪个根"等**上下文**信息。

为什么分两层：绿色节点只关心"我是什么内容"，和"我在树里的哪个位置"无关，所以**同一份绿色子树可以被插到不同位置复用**。当你改了 `main` 函数体里的一个 token，只有从那个 token 往上到根的一条路径要新建红色节点，**其余子树全是复用的绿色节点**。

这和 Salsa 的 red-green 命名是一个思想来源：**变了的才新建，没变的复用**。

## 四、rowan 的 typed API

rowan 本身是"无类型"的——它只认 `SyntaxKind`（一个 enum，列所有节点/token 种类）。但 r-a 在上面用宏生成了一层**强类型访问器**：

```rust
// 概念示意，非真实代码
let fn_node: Fn = if let Some(fn_) = syntax_node.as_fn() { fn_ } else { ... };
let name: Option<SyntaxToken> = fn_node.name_token();
let body: Option<BlockExpr> = fn_node.body();
```

好处：拿到一个节点就能用强类型方法导航，编译期保证"Fn 一定有 name_token"这种结构约束，不用到处写运行时 `if kind == FN`。

> 这一层"无类型 CST + 强类型 wrapper"是 Rust 里很值得学的模式：底层用一个泛化容器，上层用 newtype + 方法贴领域语义，既灵活又类型安全。

## 五、容错：残缺代码也能建树

IDE 必须处理"写到一半"的代码，比如：

```rust
fn main() {
    let x = // <- 用户正准备打字，这里是不完整的
```

传统 parser 遇到这个要么报错退出、要么生成一个错乱的树。rowan 的 parser 是**容错的**：

- 用**手写递归下降** parser，不是 parser generator。手写能把容错逻辑写得很细。
- parser 产出**事件流**（start node / token / finish node / error），rowan 消费事件建树。
- 遇到错误时，parser **跳过少量 token、补上"错误节点"、继续往下 parse**，尽力建出一棵"尽量完整"的树。

结果：哪怕代码语法是坏的，r-a 也能拿到一棵能用的 CST，下游 query 能基于"能识别出来的那部分"继续工作（比如给已写完的函数补全）。这是 IDE 体验的底线。

## 六、为什么这是学 Rust 的好材料

`rowan` 是个**自包含、中等规模、设计精良**的 Rust 库，比 r-a 整体小得多，适合精读：

- `Arc` 不可变共享：绿色节点用 `Arc` 共享，clone 廉价（Rust 不可变数据 + 引用计数的经典组合）。
- newtype + 宏生成强类型 API：Rust 如何在不牺牲性能的前提下做领域建模。
- 事件驱动 parse + 消费者建树：解耦的接口设计。
- `SyntaxNode` / `SyntaxToken` 用 trait 抽象公共行为（`SyntaxElement` 统一两者）。

> 建议读法：先看 rowan 的 README/示例，理解 GreenNode/RedNode 的关系，再看 r-a 怎么用宏生成 `ast::Fn` 这种 wrapper。这比一上来扎进 r-a 的 HIR 容易得多。

## 七、一句话总结

`rowan` 是 r-a 的无损语法树库：**保留空白/注释/位置的 CST + 红绿树（不可变子树复用）+ 手写容错 parser**。它让 r-a 能在残缺代码上建出可用的树，是 IDE "对正在写的代码工作"的基石。
