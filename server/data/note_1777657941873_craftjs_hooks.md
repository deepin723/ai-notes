---
id: note_1777657941873_craftjs_hooks
type: concept
title: Craft.js · Hooks API：useEditor & useNode
tags:
  - craft.js
  - Hooks
  - useEditor
  - useNode
  - React
links:
  - note_1777657941871_craftjs_overview
  - note_1777657941872_craftjs_node
created: '2026-05-02T01:00:00.000Z'
updated: '2026-05-02T01:00:00.000Z'
---

## 两个核心 Hook

Craft.js 向开发者暴露两个主要 Hook：

| Hook | 作用域 | 用途 |
|------|--------|------|
| `useEditor` | 任意组件 | 访问/操作整个编辑器全局状态 |
| `useNode` | 仅可在 Node 组件内部使用 | 访问/操作当前节点自身状态 |

---

## useEditor

### 基本用法

```tsx
const { actions, query, connectors } = useEditor();
```

### Collector 模式（性能关键）

`useEditor` 接受一个 collector 函数，**只有 collector 返回值变化时组件才重渲染**：

```tsx
const { enabled, selectedId } = useEditor((state, query) => ({
  enabled: state.options.enabled,
  selectedId: query.getEvent('selected').first(),
}));
```

这是 Redux `useSelector` 的同等模式，避免订阅无关状态变化引起的不必要重渲染。

### 返回值详解

```ts
{
  // 操作编辑器状态的命令集
  actions: {
    add, delete, move, setProp, setCustom,
    setHidden, selectNode, setOptions,
    history: { undo, redo, ignore, throttle }
  },

  // 只读查询集，不触发状态变更
  query: {
    node(id), getNodes(), serialize(),
    parseReactElement(jsx), getEvent(type)
  },

  // DOM 连接器，将 DOM 元素注册进事件系统
  connectors: {
    select(dom, id),   // 注册可选中
    hover(dom, id),    // 注册 hover
    drag(dom, id),     // 注册可拖动
    drop(dom, id),     // 注册可接收 drop
    connect(dom, id),  // 同时注册 select+hover+drop
    create(dom, jsx),  // 工具箱拖出新节点
  },

  // store 实例，极少直接使用
  store,

  // ...collector 返回的自定义字段
}
```

### 典型场景：工具栏按钮

```tsx
const Header = () => {
  const { actions: { history }, query, enabled, actions: { setOptions } } =
    useEditor((state, query) => ({
      enabled: state.options.enabled,
      canUndo: query.history.canUndo(),
      canRedo: query.history.canRedo(),
    }));

  return (
    <div>
      <button onClick={() => history.undo()} disabled={!canUndo}>撤销</button>
      <button onClick={() => history.redo()} disabled={!canRedo}>重做</button>
      <button onClick={() => {
        const json = query.serialize();
        localStorage.setItem('page', json);
      }}>保存</button>
    </div>
  );
};
```

---

## useNode

### 使用限制

`useNode` **只能在被 `<Editor>` 管理的节点组件内部调用**，即通过 `<Frame>` 或 `actions.add` 加入状态树的组件。在工具箱、属性面板等外部 UI 中调用会抛出异常。

内部实现通过 `React.useContext(NodeContext)` 读取当前节点的 id，NodeContext 由 `NodeElement` 在渲染每个节点时注入。

### 基本用法

```tsx
const { id, actions, connectors, ...collected } = useNode(
  (node) => ({                    // collector：精确订阅
    text: node.data.props.text,
    isHovered: node.events.hovered,
  })
);
```

### 返回值详解

```ts
{
  id: NodeId,                // 当前节点 ID

  // 当前节点的操作命令
  actions: {
    setProp(cb, throttleRate?),   // 修改 Props，支持防抖（throttleRate ms）
    setCustom(cb, throttleRate?), // 修改 custom 元数据
    setHidden(bool),              // 设置隐藏
  },

  // DOM 连接器（已绑定当前节点 id）
  connectors: {
    connect(dom),  // 将 DOM 同时注册为 select+hover+drop 目标
    drag(dom),     // 将 DOM 注册为拖动手柄
  },

  related,         // 关联面板组件（如 TextSettings），供外部属性面板渲染
  inNodeContext,   // 是否在 NodeContext 内，用于安全检查
  // ...collector 返回值
}
```

### 典型场景：可编辑文本组件

```tsx
export const Text = ({ text, fontSize }) => {
  const { connectors: { connect }, actions: { setProp } } = useNode();
  const { enabled } = useEditor(state => ({ enabled: state.options.enabled }));

  return (
    <div ref={connect}>                          {/* connect 绑定 DOM */}
      <ContentEditable
        html={text}
        disabled={!enabled}                      {/* 非编辑模式禁用 */}
        onChange={(e) => {
          setProp(                               {/* 修改 Props，防抖 500ms */}
            (props) => (props.text = e.target.value),
            500
          );
        }}
      />
    </div>
  );
};
```

### setProp 的防抖机制

`setProp(cb, throttleRate)` 内部调用 `actions.history.throttle(throttleRate).setProp(id, cb)`，在 throttleRate 毫秒内的连续调用会合并为一条历史记录，避免用户每输入一个字符都产生一条 undo 记录。

---

## useEditor vs useNode 对比

| 维度 | useEditor | useNode |
|------|-----------|---------|
| 调用位置 | 任意 React 组件 | 仅 Node 组件内 |
| 操作目标 | 整个编辑器状态树 | 当前节点自身 |
| 获取 connectors | 需要手动传入 id | 自动绑定当前节点 id |
| 典型使用者 | Header、Toolbar、Toolbox | Text、Button 等业务组件 |
| collector | state + query | node 对象 |

---

## 内部实现：useInternalEditor

`useEditor` 是 `useInternalEditor` 的包装，主要区别是屏蔽了若干内部 actions（`addLinkedNodeFromTree`、`setDOM`、`setNodeEvent`、`replaceNodes`、`reset`）避免开发者误用，同时也屏蔽了 `query.deserialize`（开发者应通过 `actions.deserialize` 触发，以记录历史）。
