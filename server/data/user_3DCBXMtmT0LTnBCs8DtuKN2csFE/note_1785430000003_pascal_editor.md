---
id: note_1785430000003_pascal_editor
type: raw
title: "07.31 · Pascal Editor：用 WebGPU 与节点系统构建浏览器建筑编辑器"
tags:
  - GitHub
  - WebGPU
  - 3D
  - 前端工程
  - 开源
links: []
space: 日报采编
date: '2026-07-31'
read: false
created: '2026-07-31T00:45:03+08:00'
updated: '2026-07-31T00:45:03+08:00'
---

来源：[GitHub · pascalorg/editor](https://github.com/pascalorg/editor)  
今日热度：19,999 stars，今日新增约 625，主要语言 TypeScript。

## 项目是什么

Pascal Editor 是一个运行在浏览器中的 3D 建筑编辑器，技术栈包含 React Three Fiber、Three.js 与 WebGPU。它不是把一个庞大应用写成单体，而是拆成 core、viewer、editor、nodes 和 UI 等多个包：核心层负责场景数据与协议，viewer 只负责渲染，editor 再叠加选择和编辑工具，nodes 提供内置节点与系统。

这种拆分让同一份建筑场景既能进入完整编辑器，也能被轻量 viewer 嵌入其他产品。

## 场景模型怎么组织

项目把 Site、Building、Level、Wall、Slab、Zone、Item 等都表示为节点。节点并不直接嵌套，而是存放在扁平字典中，通过 `parentId` 和 children 建立关系。扁平结构有利于按 ID 更新、持久化和撤销，也能避免深层对象更新造成大范围重渲染。

状态管理按职责分成多个 Zustand store。场景数据保存到 IndexedDB，并通过 Zundo 保留 50 步撤销历史。渲染侧维护从节点 ID 到 Three.js Object3D 的 registry，系统只处理被标记为 dirty 的节点，不必每帧遍历整棵场景树。

## 为什么系统式更新值得注意

墙体、楼板等几何并不是由 React 组件一次性算完。Renderer 先注册占位对象，后续 System 在渲染循环中根据脏节点更新几何和变换。这个架构更接近游戏引擎的 ECS 思路：数据、呈现和批量系统分离，能在复杂场景里控制更新成本。

## 我的判断

Pascal Editor 最值得学习的不是 WebGPU 标签，而是它把“可编辑 3D 应用”视为数据系统，而不是一堆鼠标交互。真正决定可维护性的，是节点协议、脏标记、撤销语义和插件边界。

风险在于前端 3D 技术栈较厚，React 状态、Three.js 对象与持久化数据之间容易出现三份状态不一致。registry 和系统层缓解了问题，但也提高了调试门槛。

## 对我的启示

如果要做可编辑画布、流程图或 3D 工具，应先定义稳定的节点模型和命令历史，再做 UI。否则功能越多，撤销、复制、序列化和多人协作越难补。
