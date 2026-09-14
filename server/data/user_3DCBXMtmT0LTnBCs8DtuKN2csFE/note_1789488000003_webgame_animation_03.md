---
id: "note_1789488000003_webgame_animation_03"
type: "raw"
title: "网页游戏制作 03｜用 Canvas 写一个可暂停、可慢放的动画播放器"
tags: ["游戏开发", "荒野夜巡", "前端进阶", "Canvas", "动画实现"]
links: []
space: "游戏开发·荒野夜巡"
date: "2026-09-15"
read: false
created: "2026-09-15T02:14:35+08:00"
updated: "2026-09-15T02:14:35+08:00"
---

这一篇从一个完全独立的小页面开始。它不用 npm、不需要外部图片，也不依赖游戏安装包。我们用 Canvas 在内存里画一张四帧示意图集，然后像播放真实素材一样裁图播放。

## 一、drawImage 的九个参数

```js
ctx.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh);
```

前四个数字表示源图里的裁剪矩形，后四个数字表示画布里的目标矩形。比如从图集第 2 格裁 32×32 的图，放大到 96×96：

```js
ctx.drawImage(atlas, 32, 0, 32, 32, 100, 80, 96, 96);
```

这里的 `atlas` 可以是已解码的 Image，也可以是另一个 Canvas。[MDN 的 drawImage 文档](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/drawImage) 给出了完整参数定义。

## 二、完整可运行的实验

把下面保存成 `index.html`，直接打开即可。因为没有 fetch、模块导入或外部图片，这个实验可以用 file://；真实项目仍应通过 HTTP 启动。

```html
<!doctype html>
<meta charset="utf-8">
<title>四帧动画实验</title>
<style>
  body { background:#17202c; color:#e9eff7; font:16px system-ui; }
  canvas { display:block; width:480px; max-width:100%;
    background:#222e40; image-rendering:pixelated; margin:16px 0; }
  button { padding:8px 16px; margin-right:8px; }
</style>
<canvas id="stage" width="480" height="240"></canvas>
<button id="pause">暂停</button>
<button id="slow">0.5×</button>
<button id="step">前进 50ms</button>
<p id="info"></p>
<script>
const canvas = document.querySelector('#stage');
const ctx = canvas.getContext('2d');
const info = document.querySelector('#info');
const atlas = document.createElement('canvas');
atlas.width = 128;
atlas.height = 32;
const a = atlas.getContext('2d');

// 生成教学图集：四格姿态，不使用任何原游戏素材。
for (let i = 0; i < 4; i++) {
  const x = i * 32;
  const arm = [0, 4, 10, 3][i];
  a.fillStyle = '#ffac59';
  a.fillRect(x + 10, 7, 12, 14);
  a.fillStyle = '#79ddd4';
  a.fillRect(x + 19, 12 - arm / 2, 9, 4);
  a.fillStyle = '#d2e9ff';
  a.fillRect(x + 10, 22, 4, 7);
  a.fillRect(x + 18, 22, 4, 7);
}

// 非等间隔关键帧：准备慢，出手快，收招稍长。
const keys = [
  { time:0, frame:0 },
  { time:0.16, frame:1 },
  { time:0.22, frame:2 },
  { time:0.30, frame:3 }
];
const duration = 0.48;
let clock = 0, last = null, paused = false, speed = 1;

function sample(t) {
  for (let i = keys.length - 1; i >= 0; i--) {
    if (keys[i].time <= t) return keys[i].frame;
  }
  return keys[0].frame;
}

function render() {
  const localTime = clock % duration;
  const frame = sample(localTime);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  ctx.strokeStyle = '#668099';
  ctx.beginPath();
  ctx.moveTo(0, 181); ctx.lineTo(480, 181); ctx.stroke();
  ctx.drawImage(atlas, frame * 32, 0, 32, 32,
    192, 88, 96, 96);
  info.textContent = `动作时间 ${localTime.toFixed(3)}s / 帧 ${frame}`;
}

function loop(ts) {
  const dt = last === null ? 0 : Math.min((ts - last) / 1000, 0.05);
  last = ts;
  if (!paused) clock += dt * speed;
  render();
  requestAnimationFrame(loop);
}

document.querySelector('#pause').onclick = e => {
  paused = !paused;
  e.target.textContent = paused ? '继续' : '暂停';
};
document.querySelector('#slow').onclick = e => {
  speed = speed === 1 ? 0.5 : 1;
  e.target.textContent = speed === 1 ? '0.5×' : '恢复 1×';
};
document.querySelector('#step').onclick = () => {
  paused = true;
  document.querySelector('#pause').textContent = '继续';
  clock += 0.05;
  render();
};
document.addEventListener('visibilitychange', () => { last = null; });
requestAnimationFrame(loop);
</script>
```

这只是姿态切换示意，不是要用四个方块替代原游戏美术。它的价值在于你可以独立理解整条播放链路。

## 三、为什么不能每次回调都 frame++

浏览器刷新频率不保证是 60Hz。若每次回调让 `frame++`，高刷新率屏幕会更快。应通过时间戳计算 `dt`，再让动作时钟增加 `dt`。

网页刷新频率和素材帧率也是两回事：显示器可以每秒刷新 120 次，素材只在几个关键时间点换图。中间的位置仍可以连续变化。强行把原素材插成很多混合帧，不一定更顺，可能只是把轮廓混成重影。

示例的 50ms 上限是保护措施：后台回来不会一次推进很长时间。代价是严重卡顿时会丢掉一部分墙钟时间，因此不是严格现实时间模拟。游戏暂停、恢复时，应同时管理游戏时钟和上次回调时间。

## 四、真实项目怎样采样

小焰的 `sprites.mjs` 使用一个很短的函数：从末尾往前找第一个 `frame.time <= time` 的关键帧。这里使用离散保持，不在两张 Sprite 之间做半透明交叉混合。

```js
// 依据真实函数展开命名；frames 已按时间升序。
function sample(frames, time) {
  for (let i = frames.length - 1; i >= 0; i--) {
    if (frames[i][0] <= time + 1e-6) return frames[i];
  }
  return frames[0];
}
```

`1e-6` 是浮点容差，防止一个理论上刚好到达的关键时间因为浮点误差迟一帧。不应把容差设成很大的数去“修复卡顿”。

## 五、循环动作和一次性动作不同

跑步可以 `time % duration` 循环。攻击播完一般需要进入下一段或回待机，不能一直 `%`，否则斩击会无条件重播。

```js
const drawTime = action.loop
  ? action.time % clip.duration
  : Math.min(action.time, clip.duration - 1e-6);
```

这段只决定“最后画哪一帧”。动作结束时是否重置、接下一招，是状态机的职责。不要让播放器自己发明连招。

## 六、加载真实资源时增加什么

先 `fetch` 动作 JSON，检查 `response.ok`，然后为每个图集创建 Image 并 `await image.decode()`。全部必要资源准备好再启用开始按钮。否则第一轮攻击可能因为图还没解码而短暂隐身。

真实角色文件还要处理轨道、轴心和坐标换算，这就是下一篇。现在先做三个实验：改变某个关键时间、把一帧重复两次、把 duration 改短。亲自观察停顿来自哪个变量，比直接加速整段动作更容易建立判断。

项目证据：小焰 `sprites.mjs` 的 `loadHero()`、`sample()`；幽灯 `app.mjs` 的 `frame()`。接口参考：[requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)。

---

上一篇：[[网页游戏制作 02｜动画素材怎样变成浏览器能读取的数据]] · 下一篇：[[网页游戏制作 04｜分层角色、坐标变换与边走边打]]
