---
id: "note_1789488000004_webgame_animation_04"
type: "raw"
title: "网页游戏制作 04｜分层角色、坐标变换与边走边打"
tags: ["游戏开发", "荒野夜巡", "前端进阶", "Canvas", "动画实现"]
links: []
space: "游戏开发·荒野夜巡"
date: "2026-09-15"
read: false
created: "2026-09-15T02:14:34+08:00"
updated: "2026-09-15T02:14:34+08:00"
---

角色边移动边攻击，需要同时满足两个条件：游戏允许位置继续变化，渲染出来的身体也符合这段运动。只让 `player.x += speed * dt`，确实能移动，但视觉上可能是人物站着滑过去。

## 一、小焰是怎样一层层画出来的

小焰 `sprites.mjs` 的 `drawHero()` 会按已经整理好的轨道顺序绘制各部件。轨道帧提供 Sprite 引用和偏移，Sprite 提供图集矩形与轴心。

省略翻转与步态替换后的教学表达：

```js
ctx.save();
ctx.translate(player.x, player.y);
ctx.scale(characterScale, characterScale);

for (const track of clip.tracks) {
  const f = sample(track.frames, actionTime);
  const sprite = data.sprites[f[3]];
  if (!sprite || sprite.page < 0) continue;
  const dx = f[1] - sprite.w * sprite.px;
  const dy = -f[2] - sprite.h * (1 - sprite.py);
  ctx.drawImage(data.images[sprite.page],
    sprite.x, sprite.y, sprite.w, sprite.h,
    dx, dy, sprite.w, sprite.h);
}
ctx.restore();
```

真实小焰还包含角色整体高度偏移、方向翻转和武器点跳过等处理。这里缩减它们，是为了让坐标公式容易读。

## 二、为什么 Y 要取负，轴心为什么不是左上角

Canvas 默认向右为 X 正方向、向下为 Y 正方向。当前导出数据的局部 Y 需要翻转，所以使用 `-f[2]`。Sprite 的 `py` 依据源数据轴心约定换算，绘制时出现 `1 - py`。

设一张图高 80，脚底轴心在距底部 8 像素的位置，那么角色世界坐标应该固定住脚底附近，而不是固定图片左上角。下一帧图片变高到 100，也仍应把同一只脚放在同一个地面点。

如果每帧只按宽高居中，角色举手、挥刀、披风展开时，图片边界改变，身体就会跳。所谓“动画像抖了一下”，可能根本不是播放速度问题，而是轴心丢失。

## 三、save / restore 是绘制作用域

`translate / rotate / scale / globalAlpha` 修改的是画布状态。画完一个角色不恢复状态，下一只怪也可能被旋转、缩小或变透明。

可以把 `save()` 理解为进入局部作用域，`restore()` 理解为退出。每个角色和每个临时变换都要有明确配对。负缩放可以用于镜像，但枪口、命中方向与子节点也必须采用同一个方向约定。

机兵多了一层：沿 `Visual/.../Body` 路径逐级应用父节点变换，再绘制部件。这类似嵌套 DOM 的 transform，但这里由我们手动执行。不能把各级坐标简单相加，因为旋转和缩放也会影响后代。

## 四、边走边打为什么曾经难做

存在三种不同资源条件：

1. **已有完整跑打动画**：直接播放原作跑打动作，优先级最高。
2. **上下身本来就是独立部件轨道**：可以评估源跑步腿部与攻击上身组合。
3. **只有一张完整全身帧**：把图片粗暴从腰部裁开，容易切断手臂、武器、衣服或留下旧身体碎片。

当前小焰属于可利用分层轨道的情况。源码把 `BackLeg / FrontLeg / ShadowNew` 识别为步态层，在普通移动攻击期间从 Run 动作取这些层，其余保持攻击轨道。

```js
const gaitLayers = new Set(['BackLeg', 'FrontLeg', 'ShadowNew']);
const useWalk = moving && gaitLayers.has(track.name);
const sourceTrack = useWalk
  ? runClip.tracks.find(t => t.name === track.name)
  : track;
const localClock = useWalk ? walkClock : attackClock;
```

这不是“任何角色都能自动跑打”的通用解法。比如旋斩、翻滚斩需要全身共同完成，应保留完整动作。小焰当前 `currentPose()` 就排除了 `RollAtk` 的腿部替换；其他全身技能还可通过动作配置关闭 gait。

## 五、脚步时钟应该跟什么走

如果角色被墙挡住，输入仍是向右，但真实位移为零。此时继续快速跑腿，会显得原地滑动。小焰使用本帧实际位移推进走路时钟：

```js
const distance = Math.hypot(player.x - oldX, player.y - oldY);
player.walk += directionSign * distance / 145;
```

`145` 是当前调校参数，表示位移如何映射到步态时间，不是通用常数。向后移动时可以反向推进步态时钟，这是项目中的视觉适配手段，也需要逐方向观察，并不等价于原作专门的后退动画。

## 六、移动方向、瞄准方向、动作方向不要混成一个

按 W 向上移动、鼠标向右瞄准时，移动向量和攻击向量不同。角色腿朝哪里、上身朝哪里，需要资源允许的规则。开始一次斩击时通常锁定该次攻击方向，避免鼠标轻晃把刀光每帧切换到不同方向；连射则可能在每轮发射重新取方向。

小焰用八方向 Clip，因此要把 `atan2` 结果映射到 E/SE/S/SW/W/NW/N/NE。数学连续角度用于弹道，离散方向用于选帧。两个用途不要强行互相替代。

枪口也应读取 `WeaponPoint` 轨道，经角色缩放、翻转映射到世界位置。否则角色动作很精细，子弹却永远从肚子正中间出现，画面会显得脱节。

## 七、机兵的重影给我们的教训

当前机兵渲染器明确区分快乐/愤怒表情，也过滤无法对应变换的部分显示副本轨道。它还提供 `bodyOnly` 等绘制选项。说明角色不是“发现一条轨道就全部叠上去”。

诊断重影时应分别检查：上一帧是否清空、同一部件是否重复绘制、是否把原攻击身体和跑步身体一起半透明混合、显示副本是否被当作正式部件。没有证据时，不应一概归因于浏览器性能或素材不够帧。

## 八、怎么验收合成动画

给脚底画十字或地面线，按 1× 与 0.5× 看完整的“走 → 攻击 → 走”。在前摇、接触、后坐、收招四个位置停下，检查：脚底是否漂移，手臂是否完整，武器是否断层，旧身体是否残留，左右与斜方向是否一致。

不要只截图出刀最帅的一帧。动作的自然感来自连续关系，问题往往藏在进入与退出攻击的瞬间。

实际阅读点：小焰 `sprites.mjs` 的 `drawHero()`、`muzzle()`；小焰 `app.mjs` 的 `currentPose()` 与位移后的 `p.walk` 更新；机兵 `sprites.mjs` 的父路径变换循环。它们位于第 01 篇列出的游戏根目录下。

---

上一篇：[[网页游戏制作 03｜用 Canvas 写一个可暂停、可慢放的动画播放器]] · 下一篇：[[网页游戏制作 05｜输入、状态机和连招：让角色真正听指挥]]
