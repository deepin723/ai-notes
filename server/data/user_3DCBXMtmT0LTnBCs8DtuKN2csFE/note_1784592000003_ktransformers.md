---
id: note_1784592000003_ktransformers
type: raw
title: "07.21 · KTransformers：把大模型推理的瓶颈拆回 CPU、GPU 与内存层"
tags:
  - GitHub Trending
  - LLM 推理
  - GPU
  - MoE
links: []
space: 日报采编
date: '2026-07-21'
read: false
created: '2026-07-21T10:02:00+08:00'
updated: '2026-07-21T10:02:00+08:00'
---

## 项目是什么

KTransformers 是清华 MADSys Lab 等团队维护的异构 LLM 推理与微调框架。Trending 当天新增 458 个 star。它的基本思路是：不要把“大模型只能靠更大 GPU”的假设当成前提，而是把 GPU、CPU、系统内存乃至存储分层使用，特别针对 MoE 模型做专家调度与量化优化。

当前 README 将能力拆成两条线：`kt-kernel` 的高性能推理，以及与 LLaMA-Factory 集成的 SFT。推理侧列出 AMX/AVX、INT4/INT8、NUMA 感知和 CPU-GPU 专家放置；微调侧主张用量化与异构路径降低超大 MoE 的显存压力。

## 技术意义

MoE 的麻烦在于“总参数巨大，但每次只激活一部分专家”。因此若能把热点专家放在 GPU、冷门专家放到 CPU，同时把数据搬运和缓存做对，成本结构可能比纯 GPU 堆叠更合理。README 的例子说明，该项目不仅做推理，还尝试把异构路径延伸到 SFT，这比单纯量化工具更有系统性。

它持续增加对新模型、Intel GPU、AMD ROCm、AVX2 和 SGLang 集成的支持，说明工程重心并非单一 benchmark，而是让异构路径进入更多硬件组合。

## 我的判断

异构推理的收益高度依赖工作负载。长上下文、并发、模型结构、PCIe/内存带宽和专家命中率都会改变结果；README 中的性能数据应被理解为特定硬件与模型配置下的案例，而不是通用加速倍数。部署前最重要的是用自己的模型、上下文长度和并发量测端到端延迟。

不过它揭示了一个更长期的趋势：模型部署会越来越像系统工程，优化目标不止是 GPU utilization，而是“每单位成本下的可用吞吐、延迟和容量”。

## 实际可用结论

- 有限 GPU 预算跑 MoE 时，先评估异构专家放置，而不是只比较量化位宽。
- 性能评测必须包含预填充、生成、并发和真实上下文长度。
- 来源：GitHub Trending；https://github.com/kvcache-ai/ktransformers
