---
id: "note_1789488000008_webgame_animation_08"
type: "raw"
title: "网页游戏制作 08｜库的选择、性能排查、测试与私人上线"
tags: ["游戏开发", "荒野夜巡", "前端进阶", "Canvas", "动画实现"]
links: []
space: "游戏开发·荒野夜巡"
date: "2026-09-15"
read: false
created: "2026-09-15T02:14:30+08:00"
updated: "2026-09-15T02:14:30+08:00"
---

理解了动画、输入和战斗之后，再选库会更清楚。库可以替你处理渲染和管理工作，但不能自动决定一个角色应该在哪一帧命中、能不能边走边打，或三种武器怎样形成有趣连招。

## 一、我们现在实际用了什么

四角色战斗页面主要是原生 JavaScript ES Modules、Canvas 2D 和 Web Audio。离线管线使用 Python、UnityPy、Pillow 与 SQLite。当前没有把 PixiJS、Phaser 或 Spine runtime 接进这几个角色的战斗页面。

AI Notes 本身是另一个项目：Vue/Vite 前端、Express 服务、Markdown 笔记。不要因为笔记站使用 Vue，就以为游戏战斗也由 Vue 组件逐帧渲染。

## 二、如果从零选技术，可以这样比较

| 方案 | 它负责什么 | 适合的情形 | 仍需自己处理 |
| --- | --- | --- | --- |
| Canvas 2D + 原生 JS | 浏览器绘制接口，逻辑自行组织 | 学习原理、小型游戏、精确控制现有素材 | 状态机、资源组织、碰撞、场景管理 |
| PixiJS | 2D 渲染、场景树、纹理与效果能力 | 图层和精灵较多，需要 GPU 渲染能力 | 游戏规则、成长、碰撞方案等 |
| Phaser | 场景、输入、动画、资源与游戏系统框架 | 希望用完整 2D 游戏框架组织项目 | 具体角色动作规则、技能设计和平衡 |
| Spine runtime | 播放 Spine 骨骼、插槽与网格时间轴 | 已有对应版本的 Spine 资源 | 游戏逻辑，且不能直接播放任意 Unity Clip |

这些是用途对比，不是速度排行榜。PixiJS 官方将其定位为 2D 渲染引擎，当前文档包含 WebGL/WebGPU；Phaser 提供面向 2D 游戏的完整框架能力。[PixiJS 官方介绍](https://pixijs.com/8.x/guides/getting-started/intro)、[Phaser 官方介绍](https://docs.phaser.io/phaser/getting-started/what-is-phaser)。Spine 则应查阅相应 runtime 与版本要求。[Spine 官方说明](https://esotericsoftware.com/spine-runtimes)

本项目暂时继续原生实现的理由是：已经掌握每一层绘制与动作时钟，也有可用角色。迁移框架需要实际收益，不能仅为了“看起来更专业”。如果后续测量发现大量绘制、特效和场景管理成为主要成本，再考虑逐步迁移 renderer。

## 三、先分清卡顿和卡手

| 现象 | 优先观察 |
| --- | --- |
| 全场都停一下 | 主线程长任务、GC、图片解码、绘制耗时 |
| 场景流畅，按键等很久 | 前后摇、动作锁、输入队列 |
| 角色轮廓有两个 | 重复图层、画布未清、交叉混合 |
| 越玩越慢 | 残留数组、未停止声音、监听器重复注册 |
| 靠墙不能反向走 | held 状态、相反键优先级、边界逻辑 |
| 某个动作突然消失 | 缺图、错误路径、缺方向、错误页号 |

当前幽灯主循环把单帧 dt 限制为最多 0.05 秒，再拆成不超过 1/120 秒的小步更新。它是有上限的子步推进，并非严格固定步长累加器；每帧最后一步可能更短。不要把二者混称“完全确定性的固定帧引擎”。

## 四、浏览器里怎么测

在 DevTools Performance 记录十几秒：待机、持续射击、放大招、升级暂停各一段。看 main thread 的长任务、render 与 update 时间、GC 峰值。再打开 Network 确認动画 JSON、PNG 和声音有没有 404。

教学测量片段：

```js
const start = performance.now();
update(dt);
const afterUpdate = performance.now();
render();
const afterRender = performance.now();
stats.updateMs = afterUpdate - start;
stats.renderMs = afterRender - afterUpdate;
```

这只是调用耗时的粗测，不代表 GPU 完成时间。也不要每帧大量 console.log；日志本身会改变你正在测量的性能。统计可以每半秒显示一次。

## 五、性能优化先做哪些

1. 资源加载时解码，战斗中复用 Image；不要每次出招创建图片并重新请求。
2. 静态背景可以先画到缓存 Canvas，再复制到主画布。缓存面积也会占内存。
3. 清理过期子弹、特效、尸体、声音节点与定时任务。
4. 限制特效与音效并发。大招要华丽，但不能每个命中都加几十个永久对象。
5. 敌人很多后再评估空间网格，减少每发子弹与全场敌人逐一检测。
6. 找到分配热点后再考虑对象池，不要为了理论性能提前重写所有对象。

一张 2048×2048 RGBA 图像的原始像素量约为 16 MiB，PNG 文件小并不表示解码后也小。浏览器还可能有额外副本与纹理开销。因此优化不能只看发布压缩包有多少 MB。

Canvas 的 backing store 和 CSS 显示尺寸也应区分。高 DPR 画布能改善一些清晰度问题，却会增加像素量；像素画还需要结合整数缩放与 `imageSmoothingEnabled=false` 观察效果。没有一个 DPR 设置能自动适配所有素材。

## 六、测试分三层

**第一层：纯规则。** 方向映射、线段碰撞、计数、卡池过滤、等级上限。

**第二层：真实角色引擎。** 逐小步推进动作，验证发射次数、伤害、冷却、暂停与升级恢复；固定随机种子便于复现。注意固定种子本身不保证所有系统在所有 dt 下完全一致。

**第三层：实际浏览器。** 看图片、听声音、检查长按输入、边界反向、0.5× 动作，确认 Chrome 真正加载了新资源。Node 测试无法证明 Canvas 上没有重影。

当前成长层可从游戏根目录运行以下已有测试入口，不需要重新生成资源：

```sh
cd reports/two-hero-growth-20260914/play
node --experimental-loader ./test-loader.mjs --test *.test.mjs
```

loader 为测试环境适配页面模块。这个命令不是完整游戏根目录全部回归；跑通它，也不能证明用户一定觉得数值平衡。

## 七、网页资源路径为何经常出错

模块自身的 import 相对模块 URL 解析，但运行时 `fetch('assets/x.json')`、`image.src='assets/x.png'` 通常相对文档 base URI。正式关卡沿用了原 demo 的资源，所以 HTML 中的 base 与生成适配器非常重要。

教学上可使用明确的模块相对路径减少混淆：

```js
const url = new URL('./assets/hero.json', import.meta.url);
const response = await fetch(url);
if (!response.ok) throw new Error(`资源请求失败 ${response.status}`);
const data = await response.json();
```

这是可选改进写法，不能声称现有文件全部如此组织。本地 URL 的 localhost 指向访问者自己的电脑，不能放进线上资源路径期待其他设备访问开发机。

## 八、私人上线真正需要哪些东西

静态游戏发布需要 HTML、JS、CSS、使用中的 PNG/JSON 和音效。离线素材数据库、完整安装包、未使用导出和研究缓存通常不用发布。当前私人游戏使用服务端访问门禁，发布脚本选择运行必需文件。

只隐藏角色选择按钮不等于访问保护：HTML 和资源接口都应处在授权范围内。验证时分别看匿名访问是否受限、已登录本人是否能加载主模块与资源。不要把会话令牌写到文章或静态脚本里。

网页游戏里的经验和伤害目前仍主要是客户端状态。门禁保护访问权限，并不自动获得防作弊能力；若未来涉及多人竞技、排行榜可信度或真实交易，就需要重新设计服务端权威边界。

本系列笔记上传的是解释、原创教学示例与代码索引；原游戏素材仍应保留来源记录，不把私用研究资源混入通用教程附件。

## 九、AI Notes 的推送为何还要部署

这篇系列写入 AI Notes 的 `server/data/用户目录/`。Git push 保存源码仓库中的 Markdown，Railway 服务运行时从镜像中的 seed 目录把新文件补入 `/data` 持久卷。现有同名文件会跳过，不是每次部署强制覆盖。

所以“本地有文件”“GitHub 有提交”“部署成功”“本人打开能读到正文”是四种不同证据。只有最后一步也完成，才应说笔记已在线可读。这里的推送指仓库推送与站点更新；不会擅自开启每日浏览器提醒。

## 十、给前端工程师的一条实践路线

第一晚只做第 03 篇播放器；第二晚加入移动、坐标换算和动作状态；第三晚加入一个木桩与命中事件；第四晚加入拖尾、声音与受击；第五晚做两张卡和暂停选卡。

每一步都留下一个能运行的小版本。等自己能解释“这一刀为什么此时画这一帧、为什么此时伤害只结算一次”，就已经跨过网页动作游戏最关键的门槛。之后换 Canvas 库、扩大技能数量，会比一开始直接接大引擎更有方向。

本篇依据：幽灯 `app.mjs`、机兵 `audio.mjs`、成长层测试与 `run.mjs`，私人发布 `tools/private-growth/`，AI Notes `Dockerfile` 与 `server/index.js` 的 seed 流程。相关浏览器接口以 [MDN](https://developer.mozilla.org/en-US/docs/Web/API) 为进一步查阅入口。

---

上一篇：[[网页游戏制作 07｜四名角色怎样接入同一套成长与选卡系统]]
