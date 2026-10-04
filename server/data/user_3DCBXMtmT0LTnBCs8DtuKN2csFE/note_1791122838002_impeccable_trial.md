---
id: note_1791122838002_impeccable_trial
type: raw
title: "10.04 · Impeccable：先扫描一个本地页面，再决定是否接入 Codex"
tags: [GitHub, 开源工具, 前端设计, Codex, 本地体验]
links: []
space: 开源工具体验
date: '2026-10-04'
read: false
created: '2026-10-04T22:07:19+08:00'
updated: '2026-10-04T22:07:19+08:00'
---

## 研究范围与结论

2026-10-04 查看 GitHub Trending 今日与本周榜，以及 [Impeccable 官方仓库](https://github.com/pbakaus/impeccable)。项目把前端设计指导、代理命令和确定性检测器组合起来。**建议先用独立检测器试一个本地页面，不急着装全套 Skill 和自动 hook。**这样能先看它指出的问题是否符合实际画面。尚未对你的项目运行检测。

## 核查到的能力

- 官方 README 称它提供 1 个设计 Skill、24 个命令和 61 条确定性检测规则；其中 `audit`、`critique`、`polish` 是供代理使用的设计工作流。
- 独立命令 `npx impeccable detect index.html`、`detect src/` 或 `detect https://...` 可扫文件、目录或已渲染网页。URL 扫描依赖已安装的 Chrome/Chromium/Edge；检测器返回具体问题，但通过检测不等于视觉或无障碍验收。
- `npx impeccable install` 可以选择项目级或全局安装；在 Codex 中会涉及项目 hook，并需要在 `/hooks` 审核。项目级试用应先看它会写入哪些配置，避免把一次实验扩散到所有项目。

## 最小体验方案

选一个现成网页原型的**副本**或一个简单本地页面。先保存桌面和手机宽度的原始截图，再运行一次 `npx impeccable detect index.html`（也可指定该副本的源码目录），将报告逐条分成：确实影响阅读/交互、属于美学偏好、误报。只修最明显的 2—3 项，再用相同视口比较前后截图和点击流程。

值得关注的不是报告条数，而是它能否指出真实问题，例如文字层级、触控目标、间距或色彩对比。若收益明确，再考虑让 `/impeccable audit` 参与一个完整页面的迭代。全套安装会改变代理工作流，须把项目 hook 的作用范围和实际执行内容一起检查。

## 我的判断与边界

这类工具最容易把统一审美包装成硬规则。对风格化游戏界面、像素素材或故意复古的 UI，某些字体、颜色、动效建议可能不适用；最终取舍要以目标画面和可操作性为准。检测器能给出高效的第一轮提示，不能代替实际浏览、截图比较、不同视口检查和交互验收。

**状态：官方资料核查完成；未安装或扫描本地项目。**

来源：[官方仓库、安装与检测器说明](https://github.com/pbakaus/impeccable) · [GitHub 今日趋势](https://github.com/trending?since=daily)
