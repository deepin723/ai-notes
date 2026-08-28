---
id: note_1787885528004_scientific_skills
type: raw
title: "08.28 · Scientific Agent Skills：AI科学家的能力目录与供应链风险"
tags: [GitHub, Agent Skills, 科研, 安全]
links: []
space: 日报采编
date: '2026-08-28'
read: false
created: '2026-08-28T10:52:11+08:00'
updated: '2026-08-28T10:52:11+08:00'
---

## 项目是什么

[Scientific Agent Skills](https://github.com/K-Dense-AI/scientific-agent-skills) 提供 138 个可安装的科研 Skill，今天约新增 498 Star，覆盖生物信息、药物发现、物理、量子、地理空间、时间序列、实验自动化和科学写作。它兼容开放 Agent Skills 规范，可供 Codex、Claude Code、Cursor 等发现和调用。

仓库把专业能力拆成三层：数据库访问，包含 PubChem、ChEMBL、UniProt、ClinicalTrials、FRED 等大量数据源；Python 工具最佳实践，覆盖 RDKit、Scanpy、BioPython、OpenMM、Qiskit 等；以及文献综述、同行评审、假设生成和图表制作等研究流程。

## 真正价值与风险

Skill 不会凭空提升模型智力，它提供的是经过整理的 API、依赖、步骤与失败模式，让代理少走文档搜索和错误集成的弯路。对复杂科研工作，这种“流程记忆”往往比再换一个更大的模型更有用。

仓库也明确警告不要一键安装全部内容。Skill 可以执行代码、联网、安装依赖并影响代理决策，社区贡献的说明文件本身就是软件供应链。项目使用 Cisco AI Defense 扫描，但自动扫描不能证明没有提示注入、数据外传或危险默认值。

## 我的判断

这个项目说明 Agent Skills 正在从个人提示词走向可分发的软件包生态。下一阶段竞争不会只是“有多少 Skill”，而是来源证明、版本锁定、最小权限、运行沙箱、测试数据和结果复现。

科学场景尤其不能把“能调用数据库”误解为“结论可靠”。数据库版本、样本偏差、统计假设和生物学解释仍需专家审查；临床决策更不能直接自动化。

## 对我的启示

安装 Skill 应像引入 npm 依赖：只装当前需要的，先读 `SKILL.md`，锁定版本或 commit，检查网络与写权限，再用小样本验证。能力目录很诱人，治理能力才决定它能不能长期使用。

