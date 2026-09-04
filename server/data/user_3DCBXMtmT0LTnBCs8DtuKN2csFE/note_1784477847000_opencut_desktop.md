---
id: note_1784477847000_opencut_desktop
type: summary
title: OpenCut desktop · gpui + Rust，为什么卡在 Xcode
tags:
  - OpenCut
  - gpui
  - Rust
  - Xcode
  - Metal
  - Cargo-workspace
links:
  - note_1784477845000_opencut_overview
  - note_1784477844000_ra_vs_rustc
  - note_1784477848000_opencut_devtooling
space: OpenCut 项目
created: '2026-07-19T02:37:00.000Z'
updated: '2026-07-19T02:37:00.000Z'
---

> 这篇把 `apps/desktop` 拆开：它是个 Rust crate，依赖 gpui（Zed 的 UI 框架），在我这台机编译到**最后一步失败**——因为缺完整 Xcode 的 Metal 编译器。总览见 [[note_1784477845000_opencut_overview]]。

## 一、Cargo workspace 长什么样

根 `Cargo.toml`：

```toml
[workspace]
resolver = "3"
members = ['apps/desktop']

[workspace.package]
version = "0.1.0"
edition = "2024"
license = "MIT"

[workspace.dependencies]
gpui = "0.2.2"
```

`apps/desktop/Cargo.toml`：

```toml
[package]
name = "opencut-desktop"
version.workspace = true          # 继承 workspace 的 0.1.0
edition.workspace = true          # 继承 edition = "2024"
license.workspace = true

[[bin]]
name = "opencut-desktop"
path = "src/main.rs"

[dependencies]
gpui = { workspace = true }       # 引用 workspace.dependencies 里的 gpui 0.2.2
```

几个**Rust workspace 标准写法**值得初学者记住：

- `[workspace] members = [...]`：列出哪些 crate 属于这个 workspace，一起编译、共享 `target/` 和 `Cargo.lock`。
- `resolver = "3"`：依赖解析器版本。Rust 2021+ 默认 resolver 2，2024 edition 用 resolver 3（更新特性解析）。**resolver 版本和 edition 匹配**，别乱改。
- `xxx.workspace = true`：字段从 workspace 根继承，避免每个 crate 重复写版本号——改一处全改。
- `[workspace.dependencies]`：声明"workspace 级依赖版本"，子 crate 用 `{ workspace = true }` 引用。**这是多 crate 共享依赖版本的标准模式**。

## 二、gpui 是什么

**gpui 是 Zed 编辑器团队开源的 Rust GUI 框架**（crates.io 上 `gpui = "0.2.2"`）。Zed 本身就是用 gpui 写的，主打**原生渲染、GPU 加速**：

- macOS 上用 **Metal**（苹果的图形 API）渲染；
- Linux 上用 Blade（Vulkan 系）；
- 保留模式 + 即时模式混合的 API 风格。

它的 API 风格从 main.rs 能看出来——类似 Tailwind 的链式调用，但用 Rust 方法：

```rust
div()
    .flex()
    .flex_col()
    .gap_2()
    .size_full()
    .justify_center()
    .items_center()
    .bg(rgb(0x111111))
    .text_color(rgb(0xffffff))
    .child(div().text_xl().child("OpenCut"))
```

这种"方法链构造 UI 树"是 Rust 生态里 GUI 框架常见范式（和 egui、iced 的思路有相似处但 API 不同）。

## 三、main.rs 解读（这 50 行是学 Rust 的好例子）

```rust
use gpui::{
    div, prelude::*, px, rgb, size, App, Application, Bounds, Context, SharedString,
    TitlebarOptions, Window, WindowBounds, WindowOptions,
};

struct Root {
    status: SharedString,
}

impl Render for Root {
    fn render(&mut self, _window: &mut Window, _cx: &mut Context<Self>) -> impl IntoElement {
        div()
            .flex().flex_col().gap_2().size_full()
            .justify_center().items_center()
            .bg(rgb(0x111111))
            .text_color(rgb(0xffffff))
            .child(div().text_xl().child("OpenCut"))
            .child(div().text_sm().text_color(rgb(0x888888)).child(self.status.clone()))
    }
}

fn main() {
    Application::new().run(|cx: &mut App| {
        let bounds = Bounds::centered(None, size(px(960.), px(600.)), cx);
        cx.open_window(
            WindowOptions {
                titlebar: Some(TitlebarOptions {
                    title: Some(SharedString::from("OpenCut")),
                    ..Default::default()
                }),
                window_bounds: Some(WindowBounds::Windowed(bounds)),
                ..Default::default()
            },
            |_, cx| {
                cx.new(|_| Root { status: "desktop shell scaffold".into() })
            },
        )
        .expect("failed to open the main window");
    });
}
```

初学者可以从这 50 行学到几个 **Rust 基础概念**：

1. **`use` + 通配 `prelude::*`**：很多 Rust 库提供 `prelude` 模块，集中"该库常用的 trait/类型"，`use foo::prelude::*` 一次导入常用项，避免每个都写全路径。这是 Rust 生态惯例。
2. **`struct Root { status: SharedString }`**：定义一个结构体当"根 UI 组件状态"。`SharedString` 是 gpui 提供的**引用计数字符串**（类似 `Arc<str>`），clone 廉价——Rust 里字符串共享的常见做法。
3. **`impl Trait for Type`**：`impl Render for Root`——给 `Root` 实现 `Render` trait（类似其它语言"实现接口"）。`Render` 要求实现 `render()` 方法。
4. **`&mut self`、`_window`、`_cx`**：`&mut self` 是可变借用；下划线前缀的 `_window`/`_cx` 表示"这个参数我不用但必须收下"，Rust 不会对它发"未使用"警告。
5. **`impl IntoElement` 返回类型**：`render` 返回"任何实现了 IntoElement 的类型"。Rust 用 `impl Trait` 作返回类型，省得写一长串具体类型。这里是 `div()` 链的结果。
6. **闭包 `|_, cx| { ... }`**：Rust 闭包用 `|参数| { 体 }`。`cx.new(|_| ...)` 里的 `|_|` 表示忽略这个参数。
7. **`..Default::default()`**：结构体更新语法——"其余字段用默认值"。配合 `Default` trait，只填关心的几个字段。非常常用。
8. **`.expect("...")`**：`Result` 上调 `expect`，成功取值、失败 panic 带消息。比 `unwrap()` 多一句人话。Rust 的错误处理基本功。
9. **`Application::new().run(...)`**：典型"框架入口"模式——创建 app、传一个闭包做启动逻辑。

> 这 50 行覆盖了 struct/trait/借用/闭包/Default/Result/impl Trait——几乎是一道浓缩的 Rust 入门题。值得逐行吃透。

## 四、构建过程：到哪一步失败

```sh
cd ~/Documents/OpenCut-main/apps/desktop
cargo build
```

发生的事（时间线）：

```
1. cargo 读 Cargo.toml，解析依赖 → gpui 0.2.2 + 它的一大堆传递依赖
   （从 USTC crates 镜像拉，~几百个 crate，几分钟）
2. 编译所有依赖 crate（rustc 真活，见 [[note_1784477844000_ra_vs_rustc]]）
3. 编译 gpui 本身 → 触发 build.rs，里面调 xcrun 编译 Metal shader
   ✗ 失败：
     cargo::error=metal shader compilation failed:
     xcrun: error: unable to find utility "metal", not a developer tool or in PATH
4. 编译 opencut-desktop 自己 ← 根本没到这步
```

## 五、为什么卡在 Metal shader

gpui 在 macOS 用 Metal 渲染，它的 build script（`build.rs`）会把 `shaders.metal` 编译成 `.metallib`，这一步调：

```sh
xcrun -sdk macosx metal -c shaders.metal ...
```

`xcrun metal` 这个工具是 **Metal Shading Language 编译器**，它**只在完整 Xcode 里**，不属于 Command Line Tools（CLT）。

我这台机的状态：

```sh
xcode-select -p
# /Library/Developer/CommandLineTools   ← 只有 CLT，没有完整 Xcode
```

CLT 有 `clang`、`swiftc`、`git`、`make` 等命令行工具，但**没有 Metal 工具链、没有 iOS SDK、没有完整的 macOS SDK 图形栈**。所以 gpui 编到 shader 就断了。

> 关键认知：**Rust 工具链（rustc/cargo）本身完全正常**——我用 hello world 验证过 `cargo new/run/clippy` 都通过。失败的不是 Rust，是 gpui 这个特定 crate 在 macOS 上对**苹果原生开发工具**的额外依赖。

## 六、怎么让 desktop 编过

唯一正路是装完整 Xcode：

```sh
# 1. 从 Mac App Store 装 Xcode（约 12GB，下载慢）
#    装完后路径在 /Applications/Xcode.app

# 2. 切换 active developer directory（从 CLT 指向 Xcode）
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer

# 3. 同意 license（首次必须）
sudo xcodebuild -license accept

# 4. 重新 build
cd ~/Documents/OpenCut-main/apps/desktop
cargo build
```

之后 `xcrun metal` 就能找到，gpui 的 shader 编译通过，desktop 就能编出来。

> 我目前**没装 Xcode**（太重，且现阶段学 Rust 用不上），所以 desktop 暂时编不过。等真的要碰 gpui 再装。

## 七、给学 Rust 的人的判断

- **想学 Rust**：完全不需要碰 desktop。`cargo new` 写自己的小项目就够，工具链已就绪。这 50 行 main.rs 反而是个不错的精读材料。
- **想学 gpui / Rust 写 GUI**：需要装 Xcode。但 gpui 是高阶对象（Zed 级工程），建议先把 Rust 基础打牢（Book 前 10 章）再回来。
- **只想跑 OpenCut**：跑 web 版（[[note_1784477846000_opencut_web]]）就行，desktop 现在也只是个骨架窗口，没有功能。

## 八、一句话总结

OpenCut desktop 是个依赖 **gpui**（Zed 的 Rust GUI 框架）的 Rust crate，main.rs 50 行是个浓缩的 Rust 入门例子。但它在我这台机**编不过最后一步**：gpui 的 build script 调 `xcrun metal` 编 Metal shader，这个工具只在**完整 Xcode**里、不在 Command Line Tools。Rust 工具链本身没问题，缺的是苹果原生图形工具链。装完整 Xcode + `xcode-select -s` 即可解决。
