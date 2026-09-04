---
id: note_1784477848000_opencut_devtooling
type: qa
title: OpenCut 踩坑实录 · GitHub 被墙 + 工具链镜像安装全流程
tags:
  - OpenCut
  - 镜像
  - proto
  - bun
  - rustup
  - USTC
  - 网络
  - 踩坑
links:
  - note_1784477845000_opencut_overview
  - note_1784477847000_opencut_desktop
space: OpenCut 项目
created: '2026-07-19T02:38:00.000Z'
updated: '2026-07-19T02:38:00.000Z'
---

> 把这次把 OpenCut 跑起来遇到的网络 + 工具链问题整理成 Q&A，下次再碰同类项目直接照搬。属于 [[note_1784477845000_opencut_overview]] 的"实操层"补充。

## Q1：`proto use` 挂住 / 失败

**现象**：按 README 跑 `proto use`，等半天报 "Failed to install rust, bun, and moon"。

**根因**：proto 要从 GitHub（`api.github.com` / release downloads）拉版本清单和二进制，而这台机 **GitHub 直连不通**：

```sh
curl -sS -m 10 https://github.com
# curl: (28) Connection timed out after 10006 milliseconds
```

**关键认知**：proto 的版本清单是从 GitHub 拿的，**没有 GitHub 镜像配置项可以改**。proto 路在这台机基本走不通。

**解法**：**绕开 proto/moon**。因为 moon 的 `web:dev` task 实际就是 `bun run dev`（见 `apps/web/moon.yml`），直接装 bun、直接跑 `bun run dev`，零损失。

## Q2：GitHub 直连不通，怎么下二进制

**现象**：所有从 `github.com/.../releases/download/...` 下载的脚本都超时或 HTTP/2 framing 错误。

**解法**：用 GitHub release **镜像代理**，URL 前面加一层：

```
https://ghfast.top/https://github.com/owner/repo/releases/download/<tag>/<asset>
https://gh-proxy.com/https://github.com/owner/repo/releases/download/<tag>/<asset>
```

实测两个都能用、响应 ~1s。比如下 bun：

```sh
# 先查清楚 1.3.11 的 asset 名（注意 bun 用 aarch64 不是 arm64）
curl -fsSL "https://ghfast.top/https://github.com/oven-sh/bun/releases/expanded_assets/bun-v1.3.11" \
  | grep -oE 'bun-[a-z0-9-]+\.zip' | sort -u

# 下 mac arm64 那个
curl -fsSL -o /tmp/bun.zip \
  "https://ghfast.top/https://github.com/oven-sh/bun/releases/download/bun-v1.3.11/bun-darwin-aarch64.zip"

# 解压手放到 ~/.bun/bin
unzip -q /tmp/bun.zip -d /tmp/bun-extract
mkdir -p ~/.bun/bin
cp /tmp/bun-extract/bun-darwin-aarch64/bun ~/.bun/bin/bun
chmod +x ~/.bun/bin/bun
```

> 同样手法下 proto 二进制也行（虽然 proto 本身在这机用不上，但 `~/.proto/bin/proto` 是这么装的）。

## Q3：rustup 装得慢到怀疑人生

**现象**：rustup 能装，但 `sh.rustup.rs` 和 `static.rust-lang.org` 官方源极慢，实测吞吐：

```
官方 static.rust-lang.org：18 KB/s   ← 废
USTC mirrors.ustc.edu.cn/rust-static：900 KB/s  ← 可用
```

**解法**：装之前设 USTC 镜像环境变量：

```sh
export RUSTUP_DIST_SERVER=https://mirrors.ustc.edu.cn/rust-static
export RUSTUP_UPDATE_ROOT=https://mirrors.ustc.edu.cn/rust-static/rustup
curl -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain 1.97.0 --profile default
```

**坑点**：即便用 USTC，某个组件（rustc）偶尔会卡在 **16 KB/s**——临时拥塞。对策：

```sh
# 杀掉卡住的 rustup
pkill -f 'rustup toolchain'
# 清掉半成品下载
rm -rf ~/.rustup/downloads/* ~/.rustup/tmp/*
# 重跑，通常就恢复 ~900 KB/s
rustup toolchain install 1.97.0 --profile default --force
```

> 这套"卡住就清 `downloads/*` + `tmp/*` 重试"对 rustup 的各种中途失败通用。

## Q4：cargo 下 crate 慢

**现象**：`cargo build` 拉 crate 时走 `crates.io` 慢/超时（`crates.io` API 直连 10s 超时）。

**解法**：配 `~/.cargo/config.toml`，把 crates.io 换成 USTC sparse 镜像：

```toml
# ~/.cargo/config.toml
[source.crates-io]
replace-with = "ustc"

[source.ustc]
registry = "sparse+https://mirrors.ustc.edu.cn/crates.io-index/"

[net]
git-fetch-with-cli = true
```

验证 mirror 是 sparse 格式（返回 JSON 配置）：

```sh
curl -sS https://mirrors.ustc.edu.cn/crates.io-index/config.json
# {"dl": "https://mirrors.ustc.edu.cn/crates.io/api/v1/crates", "api": "https://crates.io/"}
```

配完之后 OpenCut desktop 拉 gpui 那几百个 crate 全程顺畅。

## Q5：装完 rustup，`rustc` 报 "Missing manifest"

**现象**：rustup 显示 1.97.0 装了，但 `rustc --version` 报 "Missing manifest in toolchain"。

**根因**：rustup install 后台任务被中途打断（比如我等不及停了它），toolchain 目录建了但 manifest/组件没下全。

**解法**：强制重装：

```sh
rustup toolchain install 1.97.0 --profile default --force
```

`--force` 会重下并覆盖残缺目录。

## Q6：`xcrun metal` 找不到 → gpui 编不过

**现象**：`cargo build` 在 gpui 这步报：

```
cargo::error=metal shader compilation failed:
xcrun: error: unable to find utility "metal", not a developer tool or in PATH
```

**根因**：gpui 的 build script 调 `xcrun metal` 编 Metal shader，`metal` 工具只在**完整 Xcode**，不在 Command Line Tools。详见 [[note_1784477847000_opencut_desktop]]。

**解法**：装完整 Xcode → `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer` → `sudo xcodebuild -license accept` → 重新 build。

> 学 Rust 阶段不用装，web 版不依赖它。

## 一张表：工具 × 镜像/配置

| 工具 | 直连状态 | 用的镜像 | 配置方式 |
|------|---------|----------|----------|
| GitHub 二进制下载 | 超时 | `ghfast.top` / `gh-proxy.com` | URL 前缀 |
| proto（`proto use`） | 拉不到版本清单 | 无可用镜像 | **绕开**，直接装 bun/rust |
| bun | — | ghfast.top 拉二进制 | 手放 `~/.bun/bin`，写入 `~/.zshrc` |
| rustup / rustc | 18 KB/s | USTC `rust-static` | `RUSTUP_DIST_SERVER` 环境变量 |
| cargo 下 crate | crates.io API 超时 | USTC sparse 镜像 | `~/.cargo/config.toml` |
| rust-analyzer 组件 | USTC 偶发 16 KB/s | USTC | 卡住就清 `downloads/*` 重试 |
| gpui build | `xcrun metal` 缺失 | — | 装完整 Xcode（暂未装） |

## 最终可复现的安装步骤

```sh
# === bun（web 用）===
# 用 ghfast.top 拉二进制 → ~/.bun/bin/bun
echo 'export BUN_INSTALL="$HOME/.bun"' >> ~/.zshrc
echo 'export PATH="$BUN_INSTALL/bin:$PATH"' >> ~/.zshrc

# === rust（desktop + 学 Rust 用）===
export RUSTUP_DIST_SERVER=https://mirrors.ustc.edu.cn/rust-static
export RUSTUP_UPDATE_ROOT=https://mirrors.ustc.edu.cn/rust-static/rustup
curl -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain 1.97.0 --profile default
rustup component add rust-analyzer
# ~/.zshrc 自动加了 . "$HOME/.cargo/env"

# === cargo 走 USTC（写入 ~/.cargo/config.toml，见 Q4）===

# === 跑 OpenCut web ===
cd ~/Documents/OpenCut-main/apps/web
bun install && bun run dev      # → http://localhost:5173

# === 跑 OpenCut desktop（需 Xcode，暂跳过）===
# cd ~/Documents/OpenCut-main/apps/desktop && cargo run
```

## 一句话总结

这台机 GitHub 直连被墙，所以 proto（依赖 GitHub 拉清单）整个废掉，改用 **ghfast.top 镜像手拉二进制**装 bun/proto、用 **USTC 镜像**装 rustup/rustc 和配 cargo。卡住就清 `~/.rustup/downloads/*` 重试。剩一个 gpui 编不过的坑是因为缺完整 Xcode 的 Metal 工具链，跟 Rust 工具链无关。
