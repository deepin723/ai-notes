---
id: note_1777657941874_craftjs_dnd
type: concept
title: Craft.js · 拖拽引擎：事件处理与 Positioner
tags:
  - craft.js
  - 拖拽
  - DragDrop
  - DefaultEventHandlers
  - Positioner
links:
  - note_1777657941871_craftjs_overview
  - note_1777657941872_craftjs_node
created: '2026-05-02T01:00:00.000Z'
updated: '2026-05-02T01:00:00.000Z'
---

## 拖拽系统概览

Craft.js 的拖拽基于原生 HTML5 Drag & Drop API，没有引入第三方拖拽库。整个系统由两个类协作完成：

- **`DefaultEventHandlers`**：负责监听 DOM 事件、维护拖拽生命周期
- **`Positioner`**：负责实时计算 drop 指示器位置（Indicator）

---

## DefaultEventHandlers

路径：`packages/core/src/events/DefaultEventHandlers.ts`

继承自 `CoreEventHandlers`，暴露 6 个 connector handlers：

### connect
```ts
connect(el: HTMLElement, id: NodeId)
```
将一个 DOM 元素同时注册为 select + hover + drop 目标，是最常用的连接器。内部调用 `store.actions.setDOM(id, el)` 将 DOM 引用保存到节点数据中，供 Positioner 和 RenderNode 使用。

### select
```ts
select(el: HTMLElement, id: NodeId)
```
监听 `mousedown` 和 `click` 两个事件：
- `mousedown`：立即更新 `store.actions.setNodeEvent('selected', ids)`，支持多选（按住 meta/ctrl）
- `click`：处理多选时的取消逻辑
- 多选规则：选中一个节点时，会自动过滤掉其祖先/后代节点，避免父子同时被选中

### hover
```ts
hover(el: HTMLElement, id: NodeId)
```
监听 `mouseover` 和可选的 `mouseleave`，更新 `store.actions.setNodeEvent('hovered', id)`。支持通过 `removeHoverOnMouseleave` 选项控制鼠标离开时是否清除 hover 状态。

### drag（移动已有节点）
```ts
drag(el: HTMLElement, id: NodeId)
```
实现已有节点的拖动：
1. 检查 `query.node(id).isDraggable()`，不可拖动则直接返回空函数
2. `dragstart`：设置 `draggable="true"`，创建拖影（shadow），初始化 `Positioner`，设置 `dragTarget.type = 'existing'`
3. `dragend`：调用 `store.actions.move(nodes, parentId, index)` 执行节点移动

### create（从工具箱创建新节点）
```ts
create(el: HTMLElement, userElement: ReactElement | () => NodeTree)
```
与 `drag` 类似，但 `dragTarget.type = 'new'`：
1. `dragstart`：将 React Element 解析为 NodeTree，初始化 Positioner
2. `dragend`：调用 `store.actions.addNodeTree(tree, parentId, index)` 插入新节点

### drop
```ts
drop(el: HTMLElement, targetId: NodeId)
```
监听 `dragover` 和 `dragenter`，实时调用 `positioner.computeIndicator(targetId, x, y)` 并更新 `store.actions.setIndicator(indicator)`，使 UI 可以渲染 drop 位置指示线。

---

## 拖影（createShadow）

路径：`packages/core/src/events/createShadow.ts`

拖动时跟随鼠标的半透明预览元素。实现上将被拖节点的 DOM clone 后 absolute 定位到 body，并通过 `event.dataTransfer.setDragImage` 设为原生拖影。

**特殊处理**：在 Linux Chromium 下，多节点拖动的合并拖影渲染有 bug（[Chromium #550999](https://bugs.chromium.org/p/chromium/issues/detail?id=550999)），`DefaultEventHandlers.forceSingleDragShadow` 在该环境下强制回退为单节点拖影。

---

## Positioner：drop 位置计算

路径：`packages/core/src/events/Positioner.ts`

### 职责
在每次 `dragover` 时，根据鼠标坐标 (x, y) 和当前 hover 的目标节点，计算出 drop 应该发生的位置：应插入哪个 Canvas 节点的第几个子节点的前/后。

### Indicator 数据结构
```ts
interface Indicator {
  placement: {
    parent: Node;        // 目标父节点
    index: number;       // 插入位置索引
    where: 'before' | 'after'; // 插在 index 位置的前面还是后面
    currentNode: Node;   // index 处的现有节点（可能为空）
  };
  error: string | null;  // 非空则表示此位置不允许 drop
}
```

### computeIndicator 算法步骤

1. **找 Canvas 祖先**（`getCanvasAncestor`）：从 hover 的目标节点向上找最近的 `isCanvas=true` 的祖先节点，因为只有 Canvas 节点才能接收子节点
2. **边界检测**：如果鼠标在当前 Canvas 节点的边缘 10px 以内（`BORDER_OFFSET=10`），则尝试上升到父 Canvas，实现"飞出容器边界"的直觉性体验
3. **获取子节点尺寸**（`getChildDimensions`）：获取目标 Canvas 下所有子节点的 DOM BoundingRect，带缓存（`currentTargetChildDimensions`），scroll 时清缓存
4. **findPosition**：遍历子节点 BoundingRect，根据鼠标 (x,y) 计算最近的插入位置（before/after）
5. **权限校验**：调用 `query.node(parentId).isDroppable(draggedNodes)` 检查拖放规则，若失败则 `indicator.error` 非空，UI 应显示禁止图标
6. **diff 优化**：若新计算的位置与上次完全相同则返回 null，避免不必要的状态更新

### 滚动处理
`Positioner` 在构造时监听 `window` 的 scroll 事件，滚动时清除子节点尺寸缓存，确保下次 dragover 重新计算正确位置。

---

## 事件冒泡隔离（craft event system）

Craft.js 自定义了一套事件冒泡机制，在原生 DOM 事件上包装了 `e.craft.stopPropagation()`，确保子节点的事件不会冒泡到父节点的 craft 事件监听器。这解决了嵌套组件中 hover/select 状态互相干扰的问题。

---

## 拖拽完整时序

```
用户从工具箱拖出组件
  ↓
create.dragstart
  → parseReactElement(jsx) → NodeTree
  → createShadow(e, [dom])
  → new Positioner(store, { type: 'new', tree })

鼠标移动过 Canvas 节点（dragover 触发）
  ↓
drop.dragover
  → positioner.computeIndicator(targetId, x, y)
    → getCanvasAncestor()
    → isNearBorders() ? 上升到父节点
    → getChildDimensions()（有缓存）
    → findPosition() 计算 before/after
    → isDroppable() 验证规则
  → store.actions.setIndicator(indicator)
  → UI 渲染指示线

松开鼠标（dragend 触发）
  ↓
create.dragend
  → positioner.getIndicator()
  → index = placement.index + (where === 'after' ? 1 : 0)
  → store.actions.addNodeTree(tree, parent.id, index)
  → 移除 shadow，清理 Positioner
```
