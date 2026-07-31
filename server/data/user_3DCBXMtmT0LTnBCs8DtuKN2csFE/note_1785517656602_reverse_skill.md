---
id: note_1785517656602_reverse_skill
type: raw
title: "08.01 · reverse-skill：让安全分析 Agent 先过授权与证据链"
tags:
  - GitHub
  - AI安全
  - 逆向工程
  - Agent
  - 开源
links: []
space: 日报采编
date: '2026-08-01'
read: false
created: '2026-08-01T01:07:37+08:00'
updated: '2026-08-01T01:07:37+08:00'
---

来源：[GitHub · zhaoxuya520/reverse-skill](https://github.com/zhaoxuya520/reverse-skill)  
今日热度：10,372 stars，今日新增约335，主要语言PowerShell。

## 它解决的不是“缺少工具”

reverse-skill是一套给Claude Code、Codex、Cursor等编码Agent使用的安全技能路由包。面对APK、ELF、前端加密参数、PCAP、固件、CTF或授权渗透目标时，它不让Agent凭记忆猜“该用jadx还是Frida”，而是先分类任务，再检查本机工具，最后进入对应的标准工作流。

支持场景覆盖Android/iOS、二进制逆向、JavaScript协议分析、恶意软件、API安全、供应链、LLM安全、固件与漏洞利用。仓库还提供Windows、Linux、macOS和Kali的工具索引刷新脚本，用来确认哪些依赖真实可用。

## 最重要的是scope gate

流程首先读取全局规则和路由表，然后创建case目录，填写授权范围、网络配置、时间线与工作项；只有scope准备完成后，才允许对目标执行动作。分析结果需要按“证据→发现→路径→报告”组织，并把踩坑写进field journal，减少Agent下一次重复犯错。

这与普通提示词合集差别很大：它不只告诉模型“怎么做”，还规定什么时候不能做、证据如何保存、结论如何复查。

## 我的判断

安全Agent真正危险的不是能力不足，而是把探索性命令直接作用到未授权目标。reverse-skill把授权边界放在工具调用之前，是比增加更多扫描器更重要的设计。

不过路由文档再完善，也不能自动证明用户拥有授权。高风险动作仍应要求明确目标、测试窗口和影响范围，并尽量在隔离样本或沙箱中运行。工具自动安装同样带来供应链风险，需要锁定版本和校验来源。

## 对我的启示

任何能操作真实系统的Agent都应该拥有类似的前置门：先确认权限和目标，再生成计划，最后执行。报告必须能回到原始证据，而不是只保留模型总结。
