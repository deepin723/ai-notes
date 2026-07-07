---
id: note_1783382400005_claude_video
type: raw
title: "07.07 · claude-video：让 Claude 看懂任意视频的 /watch 插件"
tags:
  - GitHub
  - AI工具
  - Claude Code
  - 开发效率
links: []
space: 日报采编
date: '2026-07-07'
read: false
created: '2026-07-07T10:00:00+08:00'
updated: '2026-07-07T10:00:00+08:00'
---

## 项目概览

**仓库**：bradautomates/claude-video  
**今日 Star**：953  
**技术栈**：Python  
**定位**：给 Claude Code 加一个 `/watch` 命令，让 Claude 能分析任意视频

## 工作原理

`/watch <url>` 执行后，底层依次完成：

1. **下载**：yt-dlp 下载视频（支持 YouTube、Loom、TikTok、X/Twitter、Instagram、本地文件）
2. **帧提取**：ffmpeg 按场景变化智能抽帧（不是按固定时间间隔，而是在视觉内容变化时取帧）
3. **转录**：先尝试抓取免费字幕/caption，失败则用 Whisper 本地转录
4. **传递给 Claude**：把帧图片（作为图片消息）+ 带时间戳的转录文本一起发给 Claude

Claude 收到的是：一系列截图 + 对应时间点的文字内容，可以进行视觉+语言的联合理解。

## 典型用例

**Bug 诊断**：把录制的 bug 复现视频发给 Claude，让它定位"第几秒操作导致了什么问题"。

**竞品分析**：把竞品的产品演示视频发给 Claude，让它提取功能列表和 UX 设计要点。

**学习笔记**：把技术讲座或教程视频转化为结构化笔记，比手动截图+整理快10倍。

**会议回顾**：Loom 或 Zoom 录制的会议，让 Claude 提取 action items 和决策记录。

**代码审查**：开发者录制的 code walkthrough 视频，让 Claude 理解代码意图并给出建议。

## 安装

```bash
npx skills add bradautomates/claude-video
# 或者通过 Claude Code marketplace
```

支持 50+ AI coding agent。

## 与 Meetily 的对比

昨天写了 Meetily（本地 AI 会议助手），两者有不同的定位：

| | claude-video | meetily |
|---|---|---|
| 场景 | 任意视频（YouTube、TikTok、录屏…） | 专注实时会议 |
| 方式 | Claude Code slash command | 独立桌面应用 |
| 隐私 | 视频内容发给 Claude API | 100% 本地 |
| 实时性 | 异步分析 | 实时转录 |

两者互补而非竞争。

## 我的判断

这个插件解决了一个真实的效率问题：大量高密度信息被锁在视频格式里，而视频不可搜索、不可复制、不易提炼。

场景感知帧提取是关键技术细节——如果每秒都取一帧，一个30分钟视频会产生1800张图片，token 成本爆炸。按场景变化取帧把信息密度压缩到合理水平。

**实际可用的结论**：最直接的使用场景是把 Loom 录制的技术说明视频转化为文档。很多远程团队习惯用 Loom 传递上下文，但 Loom 不可搜索、不可引用。用 `/watch` 把它转成文字是真实的生产力提升。

需要注意：字幕/caption 抓取依赖平台是否有提供，YouTube 大多数视频有自动字幕，但其他平台不一定。没有字幕时 Whisper 本地转录需要时间（取决于本地算力）。

## 来源

GitHub Trending 日榜 #6（2026-07-07），今日 953 Stars。
