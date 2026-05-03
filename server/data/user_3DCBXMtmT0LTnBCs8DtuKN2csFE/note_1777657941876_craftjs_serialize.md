---
id: note_1777657941876_craftjs_serialize
type: concept
title: Craft.js · 序列化、历史记录与持久化
tags:
  - craft.js
  - 序列化
  - 持久化
  - History
  - undoRedo
links:
  - note_1777657941871_craftjs_overview
  - note_1777657941872_craftjs_node
created: '2026-05-02T01:00:00.000Z'
updated: '2026-05-02T01:00:00.000Z'
---

## 序列化（Serialize）

路径：`packages/core/src/utils/serializeNode.tsx`

### 核心问题：函数无法 JSON 序列化

Node Tree 中每个节点的 `data.type` 是一个 React 组件（函数/类），不能直接 JSON.stringify。序列化时需要将组件引用转为可还原的字符串。

### resolver 解析器

`<Editor resolver={{ Text, Container, Button }}>` 中的 resolver 就是组件名 → 组件引用的映射表，序列化时用于将组件引用转为名称，反序列化时用于将名称还原为引用。

### serializeNode 实现

```ts
// packages/core/src/utils/serializeNode.tsx

const reduceType = (type, resolver) => {
  if (typeof type === 'string') return type;            // 原生标签直接保留
  return { resolvedName: resolveComponent(resolver, type) }; // 组件转为名称字符串
};

export const serializeNode = (data, resolver): SerializedNode => {
  const { type, props, isCanvas, name, ...nodeData } = data;

  // 递归处理 props 中嵌套的 React Element
  const reducedComp = serializeComp({ type, isCanvas, props }, resolver);

  return { ...reducedComp, ...nodeData };
};
```

### 序列化后的 JSON 结构示例

```json
{
  "ROOT": {
    "type": { "resolvedName": "Container" },
    "isCanvas": true,
    "props": { "flexDirection": "column" },
    "displayName": "Container",
    "custom": {},
    "hidden": false,
    "nodes": ["node-1", "node-2"],
    "linkedNodes": {}
  },
  "node-1": {
    "type": { "resolvedName": "Text" },
    "isCanvas": false,
    "props": { "text": "Hello", "fontSize": "15" },
    "displayName": "Text",
    "custom": {},
    "hidden": false,
    "nodes": [],
    "linkedNodes": {},
    "parent": "ROOT"
  }
}
```

---

## 反序列化（Deserialize）

```tsx
// 从 JSON 恢复整棵节点树
actions.history.ignore().deserialize(json);
//     ↑ ignore() 使反序列化不被记入历史，避免撤销到反序列化之前的空白状态
```

内部流程：
1. `JSON.parse(json)` 得到 SerializedNodes map
2. 对每个节点，通过 resolver 将 `{ resolvedName: 'Text' }` 还原为 `Text` 组件引用
3. 还原 props 中嵌套的 React Element（递归）
4. 调用 `actions.replaceNodes(nodes)` 整体替换状态树

### Frame data prop 的特殊性

```tsx
<Frame data={savedJson}>
  {/* children 仅在 data 不存在时作为初始状态 */}
</Frame>
```

`Frame` 组件在首次渲染时（`isLoaded.current === false`）调用 `actions.history.ignore().deserialize(data)`，加上 `ignore()` 是为了让反序列化不占用 history 槽位。

---

## History（历史记录系统）

### 实现原理

基于 immutable state + 快照栈实现。每次 actions 调用都会生成新的状态快照并推入 history 栈（底层是 `crafty` 库，类似 immer + history）。

### API

```ts
// 撤销/重做
actions.history.undo()
actions.history.redo()

// 查询是否可操作
query.history.canUndo()  // → boolean
query.history.canRedo()  // → boolean

// ignore()：执行不记入历史的操作
actions.history.ignore().setProp(id, cb)
actions.history.ignore().deserialize(json)

// throttle()：在 N ms 内合并为一条历史记录（防抖）
actions.history.throttle(500).setProp(id, cb)
```

### ignore 的使用场景

| 场景 | 原因 |
|------|------|
| 初始化加载 JSON | 不应该能撤销到空白页面 |
| 编辑器 enabled 状态切换 | 进入/退出预览模式不是用户操作 |
| hover/select 事件 | 这类状态本就不应进入历史 |

### throttle 的使用场景

| 场景 | throttleRate |
|------|-------------|
| 文本输入（ContentEditable） | 500ms |
| 滑动调整数值（range input） | 200ms |
| 拖动 resize | 100ms |

原则：连续高频操作合并成一条记录，保证用户 undo 时是粒度合理的语义单元。

---

## 完整持久化示例

```tsx
const Header = () => {
  const { actions: { history }, query, actions: { setOptions }, enabled } =
    useEditor((state, query) => ({
      enabled: state.options.enabled,
      canUndo: query.history.canUndo(),
      canRedo: query.history.canRedo(),
    }));

  const save = () => {
    const json = query.serialize();        // 序列化为 JSON 字符串
    localStorage.setItem('page-draft', json);
    // 或 POST 到服务端
  };

  const load = () => {
    const json = localStorage.getItem('page-draft');
    if (json) {
      actions.history.ignore().deserialize(json); // 恢复不记历史
    }
  };

  const preview = () => {
    setOptions((opts) => { opts.enabled = !enabled; });
  };

  return (
    <header>
      <button onClick={() => history.undo()} disabled={!canUndo}>↩ 撤销</button>
      <button onClick={() => history.redo()} disabled={!canRedo}>↪ 重做</button>
      <button onClick={save}>💾 保存</button>
      <button onClick={load}>📂 读取</button>
      <button onClick={preview}>{enabled ? '预览' : '编辑'}</button>
    </header>
  );
};
```

---

## 序列化在低代码平台的意义

序列化/反序列化是低代码平台实现**"所见即所得 + 可存储 + 可分发"**的核心基础设施：

| 能力 | 依赖 |
|------|------|
| 保存草稿 | `query.serialize()` → 存 DB/localStorage |
| 多人协作 | 服务端存储 JSON，客户端反序列化 |
| 模板市场 | 预定义 JSON 模板，用户选择后 `deserialize` |
| 发布上线 | 将 JSON 与 resolver 打包，服务端渲染或客户端纯展示 |
| 版本回滚 | 存多份 JSON 快照，切换版本时 `deserialize` |
