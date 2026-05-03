---
id: note_1777657941875_craftjs_component
type: concept
title: Craft.js · 组件设计模式：craft 静态配置与 RenderNode
tags:
  - craft.js
  - 组件设计
  - craft配置
  - RenderNode
  - 低代码组件
links:
  - note_1777657941871_craftjs_overview
  - note_1777657941873_craftjs_hooks
created: '2026-05-02T01:00:00.000Z'
updated: '2026-05-02T01:00:00.000Z'
---

## craft 静态配置

每个可拖拽组件通过挂载在函数上的 `Component.craft` 静态属性进行自描述，这是 Craft.js 的核心设计约定：

```tsx
const Text = ({ text, fontSize, color }) => { /* ... */ };

Text.craft = {
  displayName: 'Text',        // 编辑器中显示的名称
  props: {                     // 默认 Props（初次拖入时使用）
    text: '默认文字',
    fontSize: '15',
    color: { r: 92, g: 90, b: 90, a: 1 },
  },
  related: {
    toolbar: TextSettings,     // 关联的属性面板组件
  },
  rules: {
    canDrag: (node) => true,                        // 是否可拖动
    canDrop: (targetNode, self) => true,            // 是否可 drop 到目标
    canMoveIn: (incomingNodes, self) => true,       // 是否可接收传入节点
    canMoveOut: (outgoingNodes, self) => true,      // 是否可将子节点移出
  },
  custom: {                    // 额外元数据，存入 node.data.custom
    displayName: 'My Text',
  },
};
```

### rules 规则系统
`rules` 中的函数在 `query.node(id).isDraggable()` / `isDroppable()` 时被调用，返回 false 或 throw 一个字符串即可阻止操作。Positioner 在计算 indicator 时也会调用这些规则，若违反则 `indicator.error` 不为空，UI 应展示禁止提示。

### related 关联面板
`related.toolbar` 指向属性面板组件。属性面板通过 `useNode(node => node.related)` 获取当前选中节点的 related 组件并动态渲染，实现"选中什么组件就显示什么属性面板"。

---

## 最小组件实现

```tsx
const Button = ({ text, background }) => {
  const { connectors: { connect, drag }, actions: { setProp } } = useNode();

  return (
    <button
      ref={(ref) => connect(drag(ref))}   // connect+drag 复合绑定
      style={{ background }}
    >
      {text}
    </button>
  );
};

Button.craft = {
  props: { text: 'Click me', background: '#4f46e5' },
  related: { toolbar: ButtonSettings },
};
```

注：`connect(drag(ref))` 是一种常见写法，让同一个 DOM 元素既是点击选中目标，也是拖动手柄。也可以拆分为两个不同元素（例如顶部工具条作为拖动手柄）。

---

## 属性面板组件（Settings Component）

属性面板组件同样使用 `useNode` Hook，通过 `actions.setProp` 修改选中节点的 Props：

```tsx
const TextSettings = () => {
  const { fontSize, actions: { setProp } } = useNode((node) => ({
    fontSize: node.data.props.fontSize,
  }));

  return (
    <div>
      <label>字号</label>
      <input
        type="range"
        value={fontSize}
        onChange={(e) => {
          setProp(                           // 修改 Props，防抖 200ms
            (props) => (props.fontSize = e.target.value),
            200
          );
        }}
      />
    </div>
  );
};
```

---

## RenderNode：编辑层包装器

路径：`examples/landing/components/editor/RenderNode.tsx`

`RenderNode` 是业务层实现的编辑状态 UI 包装器，通过 `<Editor onRender={RenderNode}>` 注入到每个节点的渲染链路中。

### 渲染原理

在 `RenderNodeToElement`（框架内置）中：
```tsx
React.createElement(onRender, { render: <DefaultRender /> })
```
每个节点渲染时，都会先经过 `onRender`（即 RenderNode），再渲染实际组件（`render` prop）。

### 典型实现

```tsx
export const RenderNode = ({ render }) => {
  const { id } = useNode();
  const { isActive } = useEditor((_, query) => ({
    isActive: query.getEvent('selected').contains(id),
  }));

  const { isHover, dom, name, moveable, deletable,
    connectors: { drag }, parent } = useNode((node) => ({
    isHover: node.events.hovered,
    dom: node.dom,
    name: node.data.custom.displayName || node.data.displayName,
    moveable: query.node(node.id).isDraggable(),
    deletable: query.node(node.id).isDeletable(),
    parent: node.data.parent,
  }));

  useEffect(() => {
    if (dom) {
      // 通过 class 控制选中/hover 的边框高亮
      if (isActive || isHover) dom.classList.add('component-selected');
      else dom.classList.remove('component-selected');
    }
  }, [dom, isActive, isHover]);

  return (
    <>
      {/* 悬浮工具条：组件名 + 移动/上移/删除按钮 */}
      {(isHover || isActive) &&
        ReactDOM.createPortal(
          <IndicatorDiv style={{ position: 'fixed', top, left, zIndex: 9999 }}>
            <span>{name}</span>
            {moveable && <MoveHandle ref={(dom) => drag(dom)} />}
            {id !== ROOT_NODE && <UpBtn onClick={() => actions.selectNode(parent)} />}
            {deletable && <DeleteBtn onMouseDown={() => actions.delete(id)} />}
          </IndicatorDiv>,
          document.querySelector('.page-container')
        )
      }
      {render}  {/* 渲染实际业务组件 */}
    </>
  );
};
```

### 关键技术点
- **Portal 渲染**：悬浮工具条使用 `ReactDOM.createPortal` 挂载到 `.page-container`，避免被 overflow:hidden 的父容器裁剪
- **scroll 跟随**：监听 `.craftjs-renderer` 的 scroll 事件，动态更新 `IndicatorDiv` 的 top/left，使工具条随组件滚动
- **drag ref**：移动手柄通过 `ref={(dom) => drag(dom)}` 将该 DOM 注册为拖动手柄，与 connect 的 DOM 可以不同

---

## Viewport 布局约定

Landing example 的 Viewport 结构定义了编辑器的整体布局：

```
<Viewport>
  ├── <Toolbox />        左侧：可拖出的组件列表
  ├── <div.page-container>
  │   ├── <Header />     顶部：撤销/重做/保存/预览
  │   └── <div.craftjs-renderer>   可编辑画布（overflow: auto）
  │       └── <Frame>   节点树渲染区域
  └── <Sidebar />        右侧：属性面板（根据选中节点动态渲染）
</Viewport>
```

Viewport 在 `useEffect` 中通过 `setOptions({ enabled: true })` 延迟 200ms 启用编辑模式，原因是等待页面完全挂载后再激活事件监听，避免 hydration 期间触发事件。
