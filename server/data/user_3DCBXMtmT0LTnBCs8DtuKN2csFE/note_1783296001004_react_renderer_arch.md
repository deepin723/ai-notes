---
id: note_1783296001004_react_renderer_arch
type: raw
title: "07.06 · React 的 Reconciler/Renderer 分离：平台会变，协议永存"
tags:
  - React
  - 架构设计
  - 前端
links: []
space: 日报采编
date: '2026-07-06'
read: false
created: '2026-07-06T10:00:00+08:00'
updated: '2026-07-06T10:00:00+08:00'
---

## 问题起点

作者做了一个在线海报编辑器，约200个组件，全部基于 React + DOM。老板说要出微信小程序版本——而小程序没有 DOM，有 view 和 text，200个组件逐个重写。三个月后出 MVP，接着老板又要出 Electron 桌面版。

根源是**组件逻辑和渲染平台的耦合**。同一套交互逻辑，在三个平台上各有一份实现，三套 bug，三倍维护成本。

## 核心设计：一行 throw 揭示的架构哲学

React 源码 `packages/react-reconciler/src/ReactFiberConfig.js` 只有20行，核心是一句：

```js
throw new Error('This module must be shimmed by a specific renderer.');
```

这一行 throw 是整个分离架构的宣言：Reconciler（协调器）负责"决定什么需要改变"，它永远不知道自己跑在什么平台上；Renderer（渲染器）负责"执行改变"，它把协调器的副作用列表翻译成平台操作。

**两者之间的契约就是 HostConfig。**

## HostConfig 的核心接口

| 函数 | DOM 实现 | Native 实现 |
|---|---|---|
| createInstance(type, props) | document.createElement(type) | UIManager.createView(tag) |
| createTextInstance(text) | document.createTextNode(text) | UIManager.createView(RCTText) |
| appendChild(parent, child) | parent.appendChild(child) | UIManager.manageChildren() |
| commitUpdate(instance, ...) | node.setAttribute(key, val) | UIManager.updateView(tag, props) |

Reconciler 调用 `createInstance`，具体实现在编译时通过 Rollup 的模块别名注入——react-dom 构建时重定向到 `ReactFiberConfigDOM.js`，react-native 重定向到 Native HostConfig。**同一份 reconciler 源码，换不同的 HostConfig，就得到了不同的 renderer。**

## 三个源码细节

**ReactFiberConfigDOM.js 有6669行**，其中只有约5%是直接代理 DOM API 的函数，其余95%是 DOM 特有的复杂逻辑：事件系统、属性处理、hydration、表单元素、资源预加载、无障碍属性。这些全部被 HostConfig 封装，reconciler 完全不知情。

**ReactFiberConfigWithNoMutation.js**：展示了"不支持的能力"的正确表达方式——不是不导出（会导致 undefined），而是导出但标记 `supportsMutation = false`，调用时抛出清晰错误。这是 Null Object Pattern 的工程实践。

**ReactFiberConfigNoop.js**：React 内测用 renderer，通过 `export *` 组合多个能力模块，通过 `Object.assign(fiberConfig, mutationConfig)` 按需覆盖。这是**能力组合（capability composition）**设计模式，各能力正交组合，没有继承层级。

## 各平台能力矩阵

| 能力 | react-dom | react-native | react-noop |
|---|---|---|---|
| supportsMutation | ✓ | ✓ | 可选 |
| supportsPersistence | ✗ | ✗ | 可选 |
| supportsHydration | ✓ | ✗ | ✓ |
| 资源预加载 | ✓ | ✗ | ✓ |

react-dom 选择 mutation 路径（增量修改 DOM），而非 persistence 路径（创建新树再整体替换），因为 DOM 天然支持增量操作且代价低。

## 可复用的工程模式

这个架构的本质是**协议驱动架构（Protocol-Driven Architecture）**，可以推广到任何需要多平台支持的系统：

- **数据存储层**：定义 StorageConfig 接口，Web 用 IndexedDB，移动端用 SQLite，测试用内存 Map
- **网络请求层**：定义 NetworkConfig 接口，Web 用 fetch，Node.js 用 http，小程序用 wx.request
- **文件系统层**：各平台分别实现同一份协议

## 我的判断

这篇文章用痛苦的真实经历引出了架构问题，比直接讲"设计模式"更有说服力。

最值得记住的结论：**好架构的本质不是写出精妙算法，而是定义清晰边界。**

React reconciler 已有上万行代码，但它对"自己跑在哪个平台上"一无所知，只认识 HostConfig 里的十几个函数。这不是技术约束，是主动设计选择。边界划清了，reconciler 可以自由演化调度算法，各 renderer 可以独立发布，双方互不干扰。

对于需要做多平台项目的开发者：最先投入的精力应该花在"定义 HostConfig"上，而不是"尽快出第一个平台的版本"。抽象的机会在你只有一个平台的时候最容易看清楚；有了两个平台之后，耦合已经凝固，代价会放大。

## 来源

掘金热榜 #2：《React Renderer 分离的多平台架构》，4.8k 浏览，32收藏。
