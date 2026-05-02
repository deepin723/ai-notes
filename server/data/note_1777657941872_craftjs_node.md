---
id: note_1777657941872_craftjs_node
type: concept
title: Craft.js · Node 系统与状态树
tags:
  - craft.js
  - Node
  - 状态树
  - 数据结构
links:
  - note_1777657941871_craftjs_overview
  - note_1777657941873_craftjs_hooks
created: '2026-05-02T01:00:00.000Z'
updated: '2026-05-02T01:00:00.000Z'
---

## Node 是什么

Node 是 Craft.js 中最核心的数据单元，代表编辑画布上的**一个 React 组件实例**。整棵页面由一棵以 `ROOT_NODE` 为根的 Node Tree 构成，存储在 EditorStore 的 `state.nodes` 中。

---

## Node 数据结构（NodeData）

```ts
interface NodeData {
  type: string | React.ElementType;   // 组件类型（函数/类/原生标签）
  name: string;                        // 组件 displayName
  displayName: string;                 // 展示名称，可覆盖
  props: Record<string, any>;          // 当前 Props 值
  isCanvas: boolean;                   // 是否可接收 children 拖放
  parent: NodeId | null;               // 父节点 ID
  nodes: NodeId[];                     // 直接子节点 ID 列表（canvas 节点）
  linkedNodes: Record<string, NodeId>; // 命名子槽（linked nodes）
  hidden: boolean;                     // 是否隐藏
  custom: Record<string, any>;         // 业务自定义元数据
}

interface Node {
  id: NodeId;
  data: NodeData;
  dom: HTMLElement | null;             // 运行时绑定的真实 DOM
  events: {
    selected: boolean;
    hovered: boolean;
    dragged: boolean;
  };
  _hydrationTimestamp: number;         // 用于触发重新挂载
}
```

---

## ROOT_NODE

`ROOT_NODE`（值为字符串 `"ROOT"`）是树的根节点，始终存在，不可删除。`<Frame>` 组件初始化时将 children 解析后挂载到 ROOT_NODE 下。

---

## Canvas 节点 vs 普通节点

| 类型 | 声明方式 | 能否接收 drop |
|------|---------|-------------|
| Canvas 节点 | `<Element is={Container} canvas>` | ✅ 可以 |
| 普通节点 | `<Element is={Button>` | ❌ 不可以 |

Canvas 节点的 `data.isCanvas = true`，Positioner 在计算 drop 位置时只会考虑 Canvas 节点作为父节点候选。

---

## Linked Nodes（命名子槽）

Linked Nodes 是一种特殊的子节点关系，不在 `data.nodes` 数组中，而在 `data.linkedNodes` 对象里：

```tsx
// 在组件内声明一个命名子槽
<Element id="header" is={Container} canvas />
```

Positioner 对 Linked Node 有特殊处理：不会把 Linked Node 当作普通兄弟节点做 before/after 插入，因为其位置固定。

---

## 节点的生命周期

```
parseReactElement(jsx)          → 将 JSX 解析为 NodeTree 对象
  ↓
actions.addNodeTree(tree)       → 写入 EditorStore
  ↓
NodeElement 渲染                 → React 递归渲染节点树
  ↓
connectors.connect(dom, id)     → 绑定 DOM 引用
  ↓
actions.delete(id)              → 从状态树移除节点
```

---

## 节点查询 API（Query）

通过 `useEditor` 获得的 `query` 对象提供只读查询，不触发状态变更：

```ts
query.node(id).get()                 // 获取节点完整数据
query.node(id).isDraggable()         // 是否可拖动（检查 rules）
query.node(id).isDeletable()         // 是否可删除
query.node(id).isDroppable(nodes)    // 目标节点能否接收这些节点 drop
query.node(id).descendants(deep)     // 获取所有后代节点 ID
query.node(id).ancestors(deep)       // 获取所有祖先节点 ID
query.node(id).isLinkedNode()        // 是否为 linked node
query.getNodes()                     // 获取完整节点 Map
query.getEvent('selected').all()     // 获取当前选中节点 IDs
query.serialize()                    // 整棵树序列化为 JSON
```

---

## 节点操作 API（Actions）

通过 `useEditor` 获得的 `actions` 对象触发状态变更，且自动记录到 History：

```ts
actions.add(node, parentId, index)         // 添加节点
actions.addNodeTree(tree, parentId, index) // 批量添加节点树
actions.delete(id)                         // 删除节点
actions.move(ids, targetParentId, index)   // 移动节点
actions.setProp(id, cb)                    // 修改节点 Props
actions.setCustom(id, cb)                  // 修改节点 custom 数据
actions.setHidden(id, bool)                // 设置节点可见性
actions.selectNode(ids)                    // 设置选中状态
actions.deserialize(json)                  // 从 JSON 恢复整棵树
```
