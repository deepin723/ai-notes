---
id: note_1777657941871_craftjs_overview
type: synthesis
title: Craft.js · 低代码拖拽引擎 · 架构总览
tags:
  - craft.js
  - 低代码
  - 可视化搭建
  - 前端架构
  - React
links:
  - note_1777657941872_craftjs_node
  - note_1777657941873_craftjs_hooks
  - note_1777657941874_craftjs_dnd
  - note_1777657941875_craftjs_component
  - note_1777657941876_craftjs_serialize
created: '2026-05-02T01:00:00.000Z'
updated: '2026-05-02T01:00:00.000Z'
---

## 什么是 Craft.js

Craft.js 是一个 React 框架，提供**构建可视化拖拽页面编辑器的底层基础设施**，而不是一个现成的编辑器产品。开发者基于它构建自己的编辑器 UI，核心理念是：

> 编辑器本身也是 React 组件，页面上的每个可编辑元素也是 React 组件。

GitHub：[prevwong/craft.js](https://github.com/prevwong/craft.js) — 8.6k ⭐

---

## 核心设计哲学

### 1. Everything is a Node（万物皆节点）
页面中所有可编辑的 React 组件都被抽象为一棵 **Node Tree**（节点树）。每个节点记录了组件类型、Props、父子关系、DOM 引用、事件状态等。

### 2. Editor State 集中管理
整个编辑器的状态（节点树、选中状态、历史记录等）存储在一个统一的 **EditorStore**（基于 Redux-like 模式）中，任何 UI 都通过 `useEditor` / `useNode` Hook 订阅状态。

### 3. 组件自描述（craft 静态配置）
每个可拖拽组件通过 `Component.craft` 静态属性声明自己的默认 Props、关联的属性面板、拖放规则等，实现**组件自治**。

### 4. 渲染与编辑分离
`<Editor>` 提供编辑上下文，`<Frame>` 定义可编辑区域，二者解耦，使得同一套组件既能在编辑模式下运行，也能在纯展示模式下运行。

---

## 整体分层架构

```
┌─────────────────────────────────────────────────────┐
│                   业务层（开发者实现）                  │
│  Toolbox（工具箱）  Sidebar（属性面板）  Header（工具栏）  │
├─────────────────────────────────────────────────────┤
│                  Craft.js API 层                     │
│   useEditor Hook    useNode Hook    connectors       │
├─────────────────────────────────────────────────────┤
│                  Editor Store 层                     │
│   Node Tree State   Events State   Options State    │
│   Actions（命令）    Query（查询）   History（历史）   │
├─────────────────────────────────────────────────────┤
│                  渲染引擎层                           │
│   Frame → NodeElement → RenderNode → 实际组件        │
├─────────────────────────────────────────────────────┤
│                  事件处理层                           │
│   DefaultEventHandlers   Positioner   createShadow  │
└─────────────────────────────────────────────────────┘
```

---

## Packages 结构

| 包 | 路径 | 职责 |
|----|------|------|
| `@craftjs/core` | `packages/core` | 核心引擎：状态、渲染、事件、Hooks |
| `@craftjs/layers` | `packages/layers` | 图层面板（类 Photoshop 图层树） |
| `@craftjs/utils` | `packages/utils` | 工具函数：ROOT_NODE、getDOMInfo 等 |

---

## 关键入口代码

```tsx
// 最小可运行编辑器
import { Editor, Frame, Element } from '@craftjs/core';

const App = () => (
  <Editor resolver={{ Text, Container }}>       {/* 1. 注册解析器 */}
    <Toolbox />                                   {/* 2. 业务 UI */}
    <Frame>                                       {/* 3. 可编辑区域 */}
      <Element is={Container} canvas>
        <Text text="Hello" />
      </Element>
    </Frame>
  </Editor>
);
```

关键点：
- `resolver`：组件名 → 组件类的映射，序列化/反序列化时靠它还原
- `<Element is={...} canvas>`：声明一个可接收子节点 drop 的容器
- `<Frame>`：Node Tree 的挂载点，支持通过 `data` prop 传入 JSON 恢复状态
