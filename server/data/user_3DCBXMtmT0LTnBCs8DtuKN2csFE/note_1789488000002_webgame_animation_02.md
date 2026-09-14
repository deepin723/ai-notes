---
id: "note_1789488000002_webgame_animation_02"
type: "raw"
title: "网页游戏制作 02｜动画素材怎样变成浏览器能读取的数据"
tags: ["游戏开发", "荒野夜巡", "前端进阶", "Canvas", "动画实现"]
links: []
space: "游戏开发·荒野夜巡"
date: "2026-09-15"
read: false
created: "2026-09-15T02:14:36+08:00"
updated: "2026-09-15T02:14:36+08:00"
---

这一篇回答最容易产生误解的问题：拿到游戏安装包后，网页为什么能播放里面的角色？答案是先在开发机上转换资源，再由网页播放器解释转换结果。浏览器并不直接理解 Unity 的 AnimationClip。

## 一、先认识四种完全不同的东西

| 名词 | 它是什么 | 是否直接决定玩法 |
| --- | --- | --- |
| Texture / PNG | 一张存储像素的图 | 否 |
| Sprite | 图中某个区域，以及尺寸、轴心等信息 | 否 |
| AnimationClip | 随时间切换 Sprite 或改变节点属性的轨道 | 否 |
| Animator / 游戏逻辑 | 决定状态转换、动作选择和事件规则 | 是，但当前网页没有直接运行原作整套逻辑 |

图集是为了装下许多 Sprite，一张图集不是一个完整角色。一个 AnimationClip 也不一定只有一条“全身序列帧”；它可能驱动身体、脸、阴影和武器等多条轨道。

还有一种常见的 Spine 动画：它主要保存骨骼、插槽、附件、网格及时间轴，由对应运行库求姿态。这和本系列重点讲的 Unity Sprite 分层动画不同。项目之前研究过 Spine，不等于这四名角色现在使用 Spine runtime。

## 二、这次真实的数据转换链路

```text
本地安装包中的 Unity Addressables bundles
  → UnityPy 读取对象与外部引用
  → SQLite 建立对象/动作/角色分组索引
  → 查 Sprite、AnimationClip、Prefab 节点
  → 解析帧时间、图片引用、轴心和变换
  → 调色板预览还原
  → Pillow 打包 PNG 图集
  → 导出 JSON 动作清单
  → 浏览器 fetch(JSON) + Image.decode(PNG)
```

资源研究目录为 `/Users/dengpeng/Documents/ember-knights-local-study`。索引是 `catalog/catalog.sqlite`，关键脚本是 `scripts/catalog_server.py`。机兵专用导出器位于游戏项目 `reports/cleaver-demo-20260914/export_assets.py`。

SQLite 只是开发时检索资源用，玩家加载角色时不会查询这个数据库。UnityPy 与 Pillow 也不属于浏览器包。

## 三、为什么曾经看到的是一团黑色

有些源图片并非可以直接显示的常规 RGBA 图。当前目录中的解析器发现部分 Sprite 的 RGB 都为 0，颜色需要通过调色板恢复。

源码 `render_image()` 对符合条件的图像，依据索引查询调色板。其中一条实际使用的转换是以 `255 - alpha` 作为颜色索引，透明像素仍保留透明。这个公式是本资源格式下的处理，绝对不能当成所有 Unity 游戏通用规则。

教学伪代码：

```python
if matches_known_palette_encoding(image):
    for pixel in image:
        if pixel.alpha == 0:
            output = transparent
        else:
            index = 255 - pixel.alpha
            output = palette[index, palette_row]
```

脚本还专门标注“索引调色板预览（非游戏内渲染）”。这意味着：恢复颜色不等于完整还原原作 shader、灯光、混合模式和所有运行时参数。对前端来说，它类似把一种特殊数据格式先解码成普通图片。

## 四、网页最终拿到的 JSON 长什么样

小焰真实数据顶层含有 `family / directions / pages / sprites / clips / note`。下面把字段改写成容易阅读的教学结构，数字为说明用，不是原图坐标：

```json
{
  "pages": ["hero-0.png"],
  "sprites": {
    "body-1": {
      "page": 0, "x": 64, "y": 32,
      "w": 48, "h": 64, "px": 0.5, "py": 0.1
    }
  },
  "clips": {
    "Attack_E": {
      "duration": 0.48,
      "tracks": [
        {
          "name": "Body", "order": 10,
          "frames": [
            {"time": 0.00, "sprite": "body-1", "x": 0, "y": 0},
            {"time": 0.12, "sprite": "body-2", "x": 3, "y": 1}
          ]
        }
      ]
    }
  }
}
```

真实小焰数据为了紧凑，帧使用 `[time, x, y, spriteId]` 四项数组；示例展开成对象帮助理解。第二个示例 sprite 故意只表达引用关系，完整文件必须同时定义 `body-2`。

这些字段分成三层：

- `pages` 告诉浏览器加载哪些大图。
- `sprites` 告诉浏览器从大图哪个矩形裁出小图，轴心在哪里。
- `clips` 告诉浏览器在什么时刻用哪张小图，部件怎样排列。

`sourceId` 等溯源字段则用于回查来源。最好保留它们，后续发现缺动作或坐标异常时能够定位，而不是只留下 `image-final-2.png`。

## 五、图集怎样打包，为什么不能只有图片

机兵导出器使用 2048×2048 页，把 Sprite 按高度整理，逐行放入；一页装不下就开新页，图片间留少量间隔。每放入一张，记录 `page/x/y/w/h`。这是一种简单的货架式打包方式，不是最优装箱算法，但实现容易核对。

打包后若只发 PNG，不发这些坐标，浏览器不知道哪个区域是哪个部件。反过来 JSON 有坐标而图集缺页，也无法绘制。

图集主要有利于资源整理和减少文件请求；在 Canvas 2D 下，“打成一张图”不等于整个角色只需要一次 `drawImage`。每个可见部件仍要画一次。GPU 渲染器还有批处理等机制，第 08 篇再讨论。

## 六、Prefab 的父子层级不能随意扔掉

机兵的导出器除了抓帧，还遍历 Prefab 的 Transform 和 SpriteRenderer，保留位置、缩放、旋转、绘制顺序。动作轨道通过节点路径与绑定关联。

如果一个手臂属于 `Visual/ArmPivot/Arm`，它的位置会同时受到几个父节点影响。只读取最末层坐标，手臂就可能出现在错误位置。源文件里的“未使用显示副本”也不能全部绘制，否则可能凭空多出一张身体。

当前机兵导出器检查 `missingRefs`，确保抽取到的动画引用能解析；但这个检查不证明动作实际观感正确。还必须在网页中对照前摇、发射、后坐和收招。

## 七、不要把动作数量当技能数量

同一招会有八方向，或 Intro/Loop/Outro 三阶段。检索到 117 个 Clip 不代表机兵有 117 个技能。它可能是少量动作乘以方向、阶段、普通/强化变体，再加受伤和死亡。

判断资源是否“齐全”，需要建立动作矩阵：每行是一类动作，每列是方向、前摇、接触、收招、特效和声音。只按名字计数会遗漏变换、特效对象和逻辑依赖。

## 八、练习与检查点

从小焰 JSON 中只取一个 `RollAtk_E`：数一数轨道，打印全部时间点，再找对应 Sprite 的轴心。你应该能解释：为什么 0.47 秒长的动作并不等于固定数量的等间隔帧。

本篇依据：`scripts/catalog_server.py` 中的 `render_image()`，以及机兵 `export_assets.py` 的 `visit()`、`clip_preview()`、图集打包和 JSON 输出。学习时不需要重跑完整安装包提取；先理解已经导出的数据即可。外部资料可参考 [UnityPy 项目](https://github.com/K0lb3/UnityPy) 与 [Spine Runtimes 说明](https://esotericsoftware.com/spine-runtimes)。本系列只整理实现方法和短代码，不随笔记附带原游戏资源包。

---

上一篇：[[网页游戏制作 01｜从 HTML、CSS、JS 到可玩的荒野夜巡]] · 下一篇：[[网页游戏制作 03｜用 Canvas 写一个可暂停、可慢放的动画播放器]]
