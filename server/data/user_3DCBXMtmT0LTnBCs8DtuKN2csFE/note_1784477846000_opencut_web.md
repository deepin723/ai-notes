---
id: note_1784477846000_opencut_web
type: summary
title: OpenCut web · 技术栈深读（Vite 8 + React 19 + TanStack Start + Cloudflare）
tags:
  - OpenCut
  - Vite
  - React19
  - TanStack-Start
  - Cloudflare
  - shadcn
  - SSR
links:
  - note_1784477845000_opencut_overview
  - note_1784477848000_opencut_devtooling
space: OpenCut 项目
created: '2026-07-19T02:36:00.000Z'
updated: '2026-07-19T02:36:00.000Z'
---

> 拆解 `apps/web` 这一端的每个选型和它怎么协作。总览见 [[note_1784477845000_opencut_overview]]。这是把 [[note_1784477845000_opencut_overview]] 里 web 那一行展开。

## 一、技术栈一张表

| 层 | 选型 | 在干嘛 |
|----|------|--------|
| 构建/Dev server | Vite 8 | 启 dev server、打包 |
| 框架 | React 19 | UI 运行时 |
| 路由/SSR | TanStack Start + TanStack Router | 文件路由 + 服务端渲染 |
| 部署/运行时 | Cloudflare（vite-plugin + wrangler） | 跑在 CF Workers/Pages |
| 样式 | Tailwind 4（vite plugin） | 原子化 CSS |
| 组件库 | shadcn（base-mira 风格 + hugeicons） | UI 组件 |
| 包管理 | bun 1.3.11 | 装依赖、跑脚本 |
| 任务编排 | moon | `moon run web:dev` |

## 二、vite.config.ts 的插件链

整个 web 的"魔法"几乎都在这个文件里：

```ts
// apps/web/vite.config.ts
const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    devtools(),          // TanStack DevTools
    cloudflare({ viteEnvironment: { name: 'ssr' } }),  // SSR 跑在 CF 运行时
    tailwindcss(),       // Tailwind 4 vite 集成
    tanstackStart(),     // TanStack Start 全家桶（路由 + SSR）
    viteReact(),         // React Fast Refresh
  ],
})
```

逐个解读：

- **`tanstackStart()`**：TanStack Start 的入口插件。它把 TanStack Router（文件路由）+ 服务端渲染串起来。这就是为什么访问 `localhost:5173` 返回的 HTML 是**已经渲染好的**（看 curl 结果里有 `<div>hello world!</div>`），而不是空壳让浏览器再 hydrate——这是 SSR。
- **`cloudflare({ viteEnvironment: { name: 'ssr' } })`**：关键。它告诉 Vite：SSR 这一段不要跑在 Node 里，而是**跑在 Cloudflare Workers 运行时**。配合 `wrangler.jsonc` 的 `nodejs_compat` flag，让服务端代码能在 CF 的 worker 环境跑。
- **`viteReact()`**：React 19 的 JSX 转换 + Fast Refresh（改代码热更新不丢状态）。
- **`tailwindcss()`**：Tailwind 4 的新集成方式（v4 不再要 `tailwind.config.js`，CSS 里 `@import "tailwindcss"` 就行，靠 vite plugin 扫类名）。
- **`devtools()`**：开发时右下角的 TanStack 面板。

`resolve: { tsconfigPaths: true }` 让 `#/...` 这种 import alias（见 `package.json` 的 `"imports": { "#/*": "./src/*" }`）按 tsconfig 解析。

## 三、TanStack 文件路由

TanStack Router 的"文件路由"模式：`src/routes/` 下的文件**自动**变成路由，由 `routeTree.gen.ts`（自动生成）汇总。

```
src/routes/
├── __root.tsx      # 根路由：整个 app 的 shell（<html><head><body>）
└── index.tsx       # 对应 "/"
```

**`__root.tsx`** 是 shell，定义了 `head()`（页面 `<head>` 内容：charset、viewport、title、favicon、字体、CSS）和 `RootDocument`（实际渲染 `<html><body>` + 挂 TanStack DevTools）。关键细节：标题写的是 `OpenCut rewrite | beta.opencut.app`——印证"重写版"。

**`index.tsx`** 就是首页，内容：

```tsx
function Home() {
  return <div><p>hello world!</p></div>
}
```

所以访问首页看到的就是这句。**这就是"骨架"的铁证。**

`router.tsx` 创建 router 实例：

```ts
createTanStackRouter({
  routeTree,
  scrollRestoration: true,
  defaultPreload: 'intent',      // hover 时预加载目标路由
  defaultPreloadStaleTime: 0,    // 预加载的数据每次都新鲜
})
```

末尾的 `declare module` 是 TypeScript 的"模块增强"——把 router 的类型注册进去，让所有路由组件拿到**类型安全的 `useNavigate`/`Link`**（链接到不存在的路由会编译报错）。这是 TanStack Router 的招牌特性。

## 四、SSR 流式渲染（HTML 里的那段怪东西）

curl 首页 HTML 时能看到一段内联脚本：

```html
<script class="$tsr" id="$tsr-stream-barrier">
  (self.$R=self.$R||{})["tsr"]=[]; self.$_TSR={
    h(){this.hydrated=!0,this.c()},
    e(){this.streamEnded=!0,this.c()},
    c(){this.hydrated&&this.streamEnded&&(delete self.$_TSR,delete self.$R.tsr)},
    ...
  }; $_TSR.e(); document.currentScript.remove()
</script>
```

这是 **TanStack Start 的流式 SSR**：服务端可以**边算边把 HTML 往浏览器推**，慢的部分（比如查数据）先用占位，算完了再流式补上。`$tsr-stream-barrier` 是个"同步屏障"——确保浏览器在拿到流式数据前先准备好水合（hydration）机制，避免hydration mismatch。

> 对学习者：这是 Next.js / Remix / TanStack Start 这代 SSR 框架的**标配机制**——"流式 SSR + Suspense 风格渐进显示"。看这段内联脚本能直观看"框架替我做了什么"。

## 五、shadcn 组件体系

`.cta.json` 揭示这个项目是用 **create-tailwind-app**（cta）脚手架生成的，选了两个 add-on：

```json
// .cta.json
"chosenAddOns": ["cloudflare", "shadcn"]
```

`components.json` 是 shadcn 的配置：

```json
{
  "style": "base-mira",       // shadcn 的新风格之一
  "rsc": false,                // 不用 React Server Components（毕竟是 Vite 不是 Next）
  "tailwind": { "baseColor": "neutral", "cssVariables": true },
  "iconLibrary": "hugeicons",  // 图标用 hugeicons 不是 lucide
  "aliases": {
    "ui": "#/components/ui",    // 配合 #/* import alias
    "utils": "#/lib/utils"
  }
}
```

shadcn 的理念：组件**不是装来的 npm 包，而是直接 copy 进你仓库的源码**（`src/components/ui/*.tsx`）。看一眼目录，已经有 30+ 个组件：`button`、`dialog`、`dropdown-menu`、`combobox`、`carousel`、`chart`、`form`…… 这就是 shadcn 的"代码即资产"风格——你拥有组件源码，想改就改。

## 六、wrangler.jsonc：部署到 Cloudflare

```jsonc
// apps/web/wrangler.jsonc
{
  "name": "opencut-web",
  "compatibility_date": "2025-09-02",
  "compatibility_flags": ["nodejs_compat"],   // 允许在 worker 里用部分 Node API
  "main": "@tanstack/react-start/server-entry",  // SSR 入口
  "routes": [{ "pattern": "new.opencut.app", "custom_domain": true }]
}
```

`main` 指向 TanStack Start 的 server entry——整个 SSR 在 CF Workers 上跑。`routes` 把 `new.opencut.app` 这个域名绑到这个 worker（对应 README 提的 "new.opencut.app"）。

## 七、运行方式（绕开 proto 的实战版）

```sh
# 我这台机 GitHub 被墙，proto 走不通，直接用 bun：
export PATH="$HOME/.bun/bin:$PATH"
cd ~/Documents/OpenCut-main/apps/web
bun install        # 649 包，~48s
bun run dev         # → http://localhost:5173
```

dev server 起来后：`VITE v8.1.5 ready in 4.2s`，访问 5173 返回 SSR 的 HTML。详见 [[note_1784477848000_opencut_devtooling]]。

## 八、几个值得记的细节

1. **`bunfig.toml` 的 `minimumReleaseAge = 604800`**：bun 拒绝装发布不到 7 天的包。是一种供应链保护（防投毒），但也意味着如果依赖 pin 了 `latest`，可能装不上刚发布的新版。OpenCut 里一堆 `"latest"`（TanStack 全家桶、elysia），目前都刚好过 7 天，没踩坑。
2. **package.json 里 `"latest"` 当版本号**：`@tanstack/react-start: "latest"`。生产项目不该这么写（不可复现），但骨架项目图方便能理解。`bun install` 时会被解析成当时最新的发布版写进 lockfile。
3. **`#/` import alias**：`package.json` 的 `"imports": { "#/*": "./src/*" }` + tsconfig + vite `tsconfigPaths`，三处协同，让 `#/components/ui/button` 这种导入可用。

## 九、一句话总结

OpenCut web 是个**全前沿选型的 SSR 应用**：Vite 8 跑构建、TanStack Start 做文件路由+流式 SSR、SSR 跑在 Cloudflare Workers（不是 Node）、Tailwind 4 + shadcn（base-mira）做 UI、bun 装包。脚手架来自 create-tailwind-app。功能虽只有 "hello world!"，但每个选型都是 2026 当下的主流，是一份"现代前端工程"的活样本。
