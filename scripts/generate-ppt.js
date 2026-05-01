import PptxGenJS from 'pptxgenjs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const pptx = new PptxGenJS()
pptx.layout = 'LAYOUT_WIDE' // 16:9

// ── Theme ──────────────────────────────────────────────────────────────────
const C = {
  bg:       '0A0D14',
  bgCard:   '12161F',
  bgCard2:  '1A1F2E',
  accent:   '6366F1',
  accentLt: '818CF8',
  accentDk: '4F46E5',
  text:     'E2E8F0',
  text2:    '94A3B8',
  text3:    '3D4A5C',
  green:    '34D399',
  pink:     'F472B6',
  blue:     '60A5FA',
  yellow:   'FBBF24',
  orange:   'FB923C',
  red:      'F87171',
}

const FONT = 'Microsoft YaHei'

// pptxgenjs only accepts 6-digit hex. Use fill.transparency (0-100) for subtle tints.
// transparency: 0 = opaque, 100 = invisible. We use 80–95 for subtle tints.

const setBg = (slide) => { slide.background = { color: C.bg } }

const topLine = (slide) => {
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: '100%', h: 0.04, fill: { color: C.accent } })
}

const sectionLabel = (slide, text, x = 0.5, y = 0.28) => {
  slide.addText(text, {
    x, y, w: 8, h: 0.28,
    fontSize: 9, bold: true, color: C.accentLt,
    fontFace: FONT, charSpacing: 2,
  })
}

// card: rounded rect with subtle border
const card = (slide, x, y, w, h, fillColor = C.bgCard, borderColor = C.accentLt) => {
  slide.addShape(pptx.ShapeType.roundRect, {
    x, y, w, h,
    fill: { color: fillColor },
    line: { color: borderColor, transparency: 75, width: 0.5 },
    rectRadius: 0.1,
  })
}

// chip: small pill badge
const chip = (slide, x, y, w, h, text, color) => {
  slide.addShape(pptx.ShapeType.roundRect, {
    x, y, w, h,
    fill: { color, transparency: 88 },
    line: { color, transparency: 60, width: 0.5 },
    rectRadius: h / 2,
  })
  slide.addText(text, {
    x, y, w, h,
    fontSize: 10, color, fontFace: FONT, align: 'center', valign: 'middle',
  })
}

// ══════════════════════════════════════════════════════════════════════════════
// SLIDE 1 · 封面
// ══════════════════════════════════════════════════════════════════════════════
{
  const slide = pptx.addSlide()
  setBg(slide)

  // Grid background dots
  for (let i = 0; i < 22; i++) {
    for (let j = 0; j < 13; j++) {
      slide.addShape(pptx.ShapeType.ellipse, {
        x: i * 0.6, y: j * 0.55, w: 0.035, h: 0.035,
        fill: { color: C.accent, transparency: 88 },
      })
    }
  }

  // Background glow ellipse
  slide.addShape(pptx.ShapeType.ellipse, {
    x: 3.2, y: 0.5, w: 6.5, h: 5.5,
    fill: { color: C.accent, transparency: 96 },
    line: { color: C.accent, transparency: 88, width: 0.5 },
  })

  // Neural node decorations
  const nx = 9.8, ny = 1.2
  slide.addShape(pptx.ShapeType.ellipse, { x: nx + 1.1, y: ny + 0.1, w: 0.22, h: 0.22, fill: { color: C.accent } })
  slide.addShape(pptx.ShapeType.ellipse, { x: nx + 0.2, y: ny + 0.85, w: 0.16, h: 0.16, fill: { color: C.accentLt } })
  slide.addShape(pptx.ShapeType.ellipse, { x: nx + 2.1, y: ny + 0.85, w: 0.16, h: 0.16, fill: { color: C.accentLt } })
  slide.addShape(pptx.ShapeType.ellipse, { x: nx + 1.1, y: ny + 1.65, w: 0.14, h: 0.14, fill: { color: C.accentDk } })

  // Main title
  slide.addText('AI 产品矩阵', {
    x: 1.0, y: 1.6, w: 8, h: 1.3,
    fontSize: 56, bold: true, color: C.text, fontFace: FONT, charSpacing: -1,
  })
  slide.addText('项目建设汇报', {
    x: 1.0, y: 2.9, w: 8, h: 0.9,
    fontSize: 36, color: C.accentLt, fontFace: FONT,
  })

  // Divider line
  slide.addShape(pptx.ShapeType.rect, { x: 1.0, y: 3.9, w: 2.8, h: 0.04, fill: { color: C.accent } })

  slide.addText('三款 AI 应用 · 统一技术栈 · 全栈自主交付', {
    x: 1.0, y: 4.15, w: 9, h: 0.45,
    fontSize: 14, color: C.text2, fontFace: FONT,
  })

  // Product tags (right)
  const tags = [
    { label: 'ai-chat',   color: C.blue },
    { label: 'ai-image',  color: C.pink },
    { label: 'Vki',       color: C.accentLt },
  ]
  tags.forEach((t, i) => {
    chip(slide, 9.5, 4.6 + i * 0.65, 2.2, 0.48, t.label, t.color)
  })

  slide.addText('2026.04', {
    x: 1.0, y: 6.8, w: 3, h: 0.3,
    fontSize: 10, color: C.text3, fontFace: FONT,
  })

  topLine(slide)
}

// ══════════════════════════════════════════════════════════════════════════════
// SLIDE 2 · 项目概览
// ══════════════════════════════════════════════════════════════════════════════
{
  const slide = pptx.addSlide()
  setBg(slide)
  topLine(slide)
  sectionLabel(slide, 'OVERVIEW · 项目概览')

  slide.addText('三款产品，覆盖 AI 应用核心场景', {
    x: 0.5, y: 0.65, w: 12, h: 0.7,
    fontSize: 26, bold: true, color: C.text, fontFace: FONT,
  })

  const products = [
    { name: 'ai-chat',  label: '多模型对话平台', color: C.blue,    desc: '支持多种大语言模型切换，流式 SSE 对话，实时响应，零账号即用', s1: '流式 SSE',  s2: '多模型切换' },
    { name: 'ai-image', label: 'AI 图像生成',    color: C.pink,    desc: '基于 gpt-image-2，文生图 + 图生图 + 后台队列，非阻塞体验',   s1: '后台队列',  s2: '参考图上传' },
    { name: 'Vki',      label: '神经元知识库',   color: C.accentLt, desc: 'AI 编译笔记为 6 类 Wiki 页面，wikilink 互联，纯文件存储',    s1: '6类Wiki',   s2: 'Wikilink'  },
  ]

  products.forEach((p, i) => {
    const x = 0.4 + i * 4.2
    card(slide, x, 1.55, 3.95, 5.1, C.bgCard, p.color)
    slide.addShape(pptx.ShapeType.rect, { x, y: 1.55, w: 3.95, h: 0.06, fill: { color: p.color } })

    slide.addText(p.name, {
      x: x + 0.22, y: 1.82, w: 3.5, h: 0.55,
      fontSize: 22, bold: true, color: C.text, fontFace: FONT,
    })
    slide.addText(p.label, {
      x: x + 0.22, y: 2.38, w: 3.5, h: 0.38,
      fontSize: 12, color: p.color, fontFace: FONT,
    })
    slide.addText(p.desc, {
      x: x + 0.22, y: 2.85, w: 3.5, h: 1.2,
      fontSize: 11, color: C.text2, fontFace: FONT, wrap: true,
    })

    chip(slide, x + 0.22, 4.9, 1.6, 0.38, p.s1, p.color)
    chip(slide, x + 2.0,  4.9, 1.6, 0.38, p.s2, p.color)
  })

  slide.addText('统一技术栈：Vue 3 + TypeScript + Express  ·  部署：Vercel + Railway', {
    x: 0.5, y: 6.8, w: 12, h: 0.3,
    fontSize: 10, color: C.text3, fontFace: FONT, align: 'center',
  })
}

// ══════════════════════════════════════════════════════════════════════════════
// SLIDE 3 · ai-chat
// ══════════════════════════════════════════════════════════════════════════════
{
  const slide = pptx.addSlide()
  setBg(slide)
  topLine(slide)
  sectionLabel(slide, 'PRODUCT 01 · ai-chat')

  slide.addShape(pptx.ShapeType.rect, { x: 0.5, y: 0.62, w: 0.07, h: 0.75, fill: { color: C.blue } })
  slide.addText('多模型 AI 对话平台', {
    x: 0.72, y: 0.62, w: 9, h: 0.75,
    fontSize: 28, bold: true, color: C.text, fontFace: FONT,
  })
  slide.addText('让每个人都能便捷访问顶级大语言模型', {
    x: 0.72, y: 1.35, w: 9, h: 0.4,
    fontSize: 13, color: C.text2, fontFace: FONT,
  })

  const features = [
    { title: '⚡ 流式输出', desc: 'SSE 技术逐字输出，零等待感，响应即呈现' },
    { title: '🔄 多模型切换', desc: 'GPT / Claude / Gemini 等任意 OpenAI 兼容接口' },
    { title: '💬 多轮对话', desc: '上下文历史保留，支持连续追问' },
    { title: '📝 Markdown 渲染', desc: '代码高亮、表格、列表，格式完整支持' },
    { title: '🔑 零数据风险', desc: 'Key 仅存本地 localStorage，后端不持久化' },
    { title: '🚀 即到即用', desc: '无需注册账号，输入 API Key 立即开始' },
  ]

  features.forEach((f, i) => {
    const x = 0.5 + (i % 3) * 4.05
    const y = 2.0 + Math.floor(i / 3) * 1.6
    card(slide, x, y, 3.85, 1.35, C.bgCard, C.blue)
    slide.addText(f.title, {
      x: x + 0.2, y: y + 0.12, w: 3.45, h: 0.45,
      fontSize: 13, bold: true, color: C.blue, fontFace: FONT,
    })
    slide.addText(f.desc, {
      x: x + 0.2, y: y + 0.58, w: 3.45, h: 0.65,
      fontSize: 11, color: C.text2, fontFace: FONT, wrap: true,
    })
  })

  // Tech stack sidebar
  card(slide, 9.8, 1.8, 3.0, 3.95, C.bgCard2, C.accentLt)
  slide.addText('技术栈', {
    x: 10.0, y: 1.98, w: 2.6, h: 0.4,
    fontSize: 12, bold: true, color: C.accentLt, fontFace: FONT,
  })
  const stack = [
    ['前端', 'Vue 3 + TypeScript'],
    ['构建', 'Vite + HMR'],
    ['后端', 'Node.js + Express'],
    ['流式', 'SSE 透传代理'],
    ['前端部署', 'Vercel CDN'],
    ['后端部署', 'Railway Docker'],
  ]
  stack.forEach(([k, v], i) => {
    slide.addText(k, { x: 10.0, y: 2.5 + i * 0.5, w: 1.1, h: 0.42, fontSize: 10, color: C.text3, fontFace: FONT })
    slide.addText(v, { x: 11.05, y: 2.5 + i * 0.5, w: 1.65, h: 0.42, fontSize: 10, color: C.text, fontFace: FONT })
  })
}

// ══════════════════════════════════════════════════════════════════════════════
// SLIDE 4 · ai-image
// ══════════════════════════════════════════════════════════════════════════════
{
  const slide = pptx.addSlide()
  setBg(slide)
  topLine(slide)
  sectionLabel(slide, 'PRODUCT 02 · ai-image · Deepin Image')

  slide.addShape(pptx.ShapeType.rect, { x: 0.5, y: 0.62, w: 0.07, h: 0.75, fill: { color: C.pink } })
  slide.addText('Deepin Image · AI 图像生成平台', {
    x: 0.72, y: 0.62, w: 9, h: 0.75,
    fontSize: 26, bold: true, color: C.text, fontFace: FONT,
  })
  slide.addText('基于 gpt-image-2，让非技术用户也能生成高质量图像', {
    x: 0.72, y: 1.35, w: 9, h: 0.4,
    fontSize: 13, color: C.text2, fontFace: FONT,
  })

  // User flow bar
  card(slide, 0.4, 1.95, 12.5, 1.05, C.bgCard2, C.pink)
  slide.addText('用户流程', { x: 0.62, y: 2.05, w: 1.5, h: 0.3, fontSize: 10, bold: true, color: C.text3, fontFace: FONT })
  const steps = ['输入 API Key', '选尺寸 + 风格', '描述创意', '优化提示词', '提交生成', '后台队列', '查看 / 下载']
  steps.forEach((s, i) => {
    chip(slide, 0.55 + i * 1.74, 2.4, 1.58, 0.44, (i + 1) + '. ' + s, C.pink)
    if (i < steps.length - 1) {
      slide.addText('›', { x: 2.07 + i * 1.74, y: 2.46, w: 0.22, h: 0.32, fontSize: 14, color: C.text3, fontFace: FONT })
    }
  })

  // Three key innovations
  const innovations = [
    {
      title: '后台任务队列', color: C.pink,
      items: ['生成不阻塞 UI，可继续操作', 'tasks[] 响应式数组 + isProcessing flag', '浮动面板实时显示进度 %', '任务完成后自动处理下一个'],
    },
    {
      title: 'SSE 流式解析', color: C.yellow,
      items: ['逐行读取 data: {...} SSE 事件', '匹配 image_generation_call 类型', '找到 base64 立即返回，不等流结束', '解决 Vercel 60s 超时限制'],
    },
    {
      title: '提示词增强引擎', color: C.green,
      items: ['中文简描 → 专业英文 prompt', '调 /chat/completions 扩展描述', '8 种风格标签快速附加', '参考图上传支持图生图'],
    },
  ]
  innovations.forEach((inn, i) => {
    const x = 0.4 + i * 4.3
    card(slide, x, 3.2, 4.1, 3.3, C.bgCard, inn.color)
    slide.addShape(pptx.ShapeType.rect, { x, y: 3.2, w: 4.1, h: 0.06, fill: { color: inn.color } })
    slide.addText(inn.title, { x: x + 0.2, y: 3.38, w: 3.7, h: 0.45, fontSize: 14, bold: true, color: inn.color, fontFace: FONT })
    inn.items.forEach((item, j) => {
      slide.addText('· ' + item, { x: x + 0.2, y: 3.93 + j * 0.56, w: 3.7, h: 0.5, fontSize: 10.5, color: C.text2, fontFace: FONT })
    })
  })
}

// ══════════════════════════════════════════════════════════════════════════════
// SLIDE 5 · Vki
// ══════════════════════════════════════════════════════════════════════════════
{
  const slide = pptx.addSlide()
  setBg(slide)
  topLine(slide)
  sectionLabel(slide, 'PRODUCT 03 · Vki · 神经元知识库')

  slide.addShape(pptx.ShapeType.rect, { x: 0.5, y: 0.62, w: 0.07, h: 0.75, fill: { color: C.accentLt } })
  slide.addText('Vki · 神经元智能知识库', {
    x: 0.72, y: 0.62, w: 9, h: 0.75,
    fontSize: 28, bold: true, color: C.text, fontFace: FONT,
  })
  slide.addText('笔记录入 → AI 编译 → 6 类结构化 Wiki → wikilink 知识网络', {
    x: 0.72, y: 1.35, w: 9, h: 0.4,
    fontSize: 13, color: C.text2, fontFace: FONT,
  })

  // 6 wiki types
  card(slide, 0.4, 1.9, 7.6, 4.35, C.bgCard2, C.accentLt)
  slide.addText('6 类 Wiki 页面', { x: 0.62, y: 2.05, w: 4, h: 0.42, fontSize: 13, bold: true, color: C.accentLt, fontFace: FONT })
  const wikiTypes = [
    { type: '实体', color: C.pink,    desc: '人物 / 产品 / 工具 · 建立基础档案' },
    { type: '概念', color: C.blue,    desc: '理论 / 方法 / 技术 · 形成体系化概念库' },
    { type: '摘要', color: C.green,   desc: '核心信息浓缩 · 保留关键要点' },
    { type: '综合', color: C.accentLt, desc: '跨笔记分析演化 · 整合逻辑观点' },
    { type: '对比', color: C.yellow,  desc: '方案差异 Markdown 表格 · 辅助决策' },
    { type: '问答', color: C.orange,  desc: 'Q&A 格式 · 知识自测与面试准备' },
  ]
  wikiTypes.forEach((w, i) => {
    const y = 2.6 + i * 0.57
    slide.addShape(pptx.ShapeType.ellipse, { x: 0.6, y: y + 0.13, w: 0.15, h: 0.15, fill: { color: w.color } })
    slide.addText(w.type, { x: 0.85, y: y, w: 0.8, h: 0.42, fontSize: 12, bold: true, color: w.color, fontFace: FONT })
    slide.addText(w.desc, { x: 1.7, y: y, w: 5.9, h: 0.42, fontSize: 11, color: C.text2, fontFace: FONT })
  })

  // Right: highlights
  card(slide, 8.3, 1.9, 5.0, 4.35, C.bgCard, C.accentLt)
  slide.addText('核心设计亮点', { x: 8.52, y: 2.05, w: 4.6, h: 0.42, fontSize: 13, bold: true, color: C.accentLt, fontFace: FONT })
  const highlights = [
    '📂  纯文件存储，.md 格式，无数据库',
    '🔗  [[wikilink]] 语法，点击跳转关联页',
    '🤖  LLM 一键编译，自动生成多类页面',
    '🔍  来源追溯，可回溯至原始笔记',
    '🏷️  标签体系 + 类型筛选，快速定位',
    '✏️  支持重新编译，知识持续迭代',
  ]
  highlights.forEach((h, i) => {
    slide.addText(h, {
      x: 8.52, y: 2.6 + i * 0.56, w: 4.6, h: 0.48,
      fontSize: 11, color: C.text2, fontFace: FONT,
    })
  })

  // Flow
  slide.addShape(pptx.ShapeType.rect, { x: 0.4, y: 6.42, w: 12.5, h: 0.5, fill: { color: C.bgCard2 }, line: { color: C.accent, transparency: 75, width: 0.5 }, rectRadius: 0.08 })
  slide.addText('原始笔记  →  点击「编译为 Wiki」  →  LLM 生成 JSON  →  6 类 .md 文件  →  Wikilink 互联知识网络', {
    x: 0.5, y: 6.42, w: 12.3, h: 0.5,
    fontSize: 11, color: C.accentLt, fontFace: FONT, align: 'center', valign: 'middle',
  })
}

// ══════════════════════════════════════════════════════════════════════════════
// SLIDE 6 · 统一技术架构
// ══════════════════════════════════════════════════════════════════════════════
{
  const slide = pptx.addSlide()
  setBg(slide)
  topLine(slide)
  sectionLabel(slide, 'ARCHITECTURE · 统一技术选型')

  slide.addText('一套技术栈，三款产品', {
    x: 0.5, y: 0.65, w: 12, h: 0.65,
    fontSize: 26, bold: true, color: C.text, fontFace: FONT,
  })

  const cols = [
    {
      title: '前端层', color: C.blue,
      items: [['框架', 'Vue 3 + Composition API'], ['语言', 'TypeScript 强类型'], ['构建', 'Vite  ·  极速 HMR'], ['样式', '纯 CSS，无 UI 框架'], ['状态', 'ref / computed'], ['路由', '条件渲染，无额外依赖']],
    },
    {
      title: '后端层', color: C.green,
      items: [['运行时', 'Node.js v24 · ESM 模式'], ['框架', 'Express 轻量代理'], ['存储', '无 DB / 文件系统（Vki）'], ['流式', 'SSE ReadableStream'], ['超时', 'AbortSignal 600s'], ['解析', 'gray-matter frontmatter']],
    },
    {
      title: '部署层', color: C.orange,
      items: [['前端', 'Vercel · 全球 CDN'], ['后端', 'Railway · Docker 容器'], ['CI/CD', 'GitHub push 自动触发'], ['HTTPS', '全链路自动证书'], ['部署', '约 2–3 分钟完成'], ['监控', 'Railway 内置日志']],
    },
  ]

  cols.forEach((col, i) => {
    const x = 0.4 + i * 4.25
    card(slide, x, 1.5, 4.0, 5.2, C.bgCard, col.color)
    slide.addShape(pptx.ShapeType.rect, { x, y: 1.5, w: 4.0, h: 0.07, fill: { color: col.color } })
    slide.addText(col.title, { x: x + 0.22, y: 1.68, w: 3.56, h: 0.48, fontSize: 15, bold: true, color: col.color, fontFace: FONT })
    col.items.forEach(([k, v], j) => {
      slide.addText(k, { x: x + 0.22, y: 2.3 + j * 0.68, w: 1.1, h: 0.56, fontSize: 10, color: C.text3, fontFace: FONT, valign: 'middle' })
      slide.addText(v, { x: x + 1.3, y: 2.3 + j * 0.68, w: 2.7, h: 0.56, fontSize: 10.5, color: C.text, fontFace: FONT, valign: 'middle' })
    })
  })

  // Security note
  card(slide, 0.4, 6.8, 12.5, 0.48, C.bgCard2, C.green)
  slide.addText('🔐  安全设计：API Key 存于 localStorage，通过 Request Header 传递，后端仅转发不持久化，零用户数据库风险', {
    x: 0.6, y: 6.8, w: 12.2, h: 0.48,
    fontSize: 10.5, color: C.text2, fontFace: FONT, valign: 'middle',
  })
}

// ══════════════════════════════════════════════════════════════════════════════
// SLIDE 7 · 为什么用 Docker / Railway
// ══════════════════════════════════════════════════════════════════════════════
{
  const slide = pptx.addSlide()
  setBg(slide)
  topLine(slide)
  sectionLabel(slide, 'INFRASTRUCTURE · 为什么选择 Docker + Railway')

  slide.addText('Serverless 不够用，容器化才是正解', {
    x: 0.5, y: 0.65, w: 12, h: 0.65,
    fontSize: 24, bold: true, color: C.text, fontFace: FONT,
  })

  // Problem
  card(slide, 0.4, 1.5, 5.85, 5.1, C.bgCard, C.red)
  slide.addShape(pptx.ShapeType.rect, { x: 0.4, y: 1.5, w: 5.85, h: 0.07, fill: { color: C.red } })
  slide.addText('❌  Serverless 的局限', { x: 0.62, y: 1.68, w: 5.4, h: 0.45, fontSize: 14, bold: true, color: C.red, fontFace: FONT })
  const problems = [
    '函数超时 60s → 图像生成需 2–5 分钟',
    '无状态进程 → SSE 流式长连接中断',
    '冷启动延迟 → 首次请求卡顿明显',
    '无文件持久化 → Vki .md 无法保存',
    '进程隔离 → 连接池、缓存无法复用',
  ]
  problems.forEach((p, i) => {
    slide.addText('·  ' + p, { x: 0.62, y: 2.28 + i * 0.78, w: 5.4, h: 0.68, fontSize: 11, color: C.text2, fontFace: FONT })
  })

  // Arrow
  slide.addText('→', { x: 6.4, y: 3.8, w: 0.5, h: 0.5, fontSize: 28, color: C.accent, fontFace: FONT })

  // Solution
  card(slide, 7.1, 1.5, 5.7, 5.1, C.bgCard, C.green)
  slide.addShape(pptx.ShapeType.rect, { x: 7.1, y: 1.5, w: 5.7, h: 0.07, fill: { color: C.green } })
  slide.addText('✅  Docker + Railway 的优势', { x: 7.32, y: 1.68, w: 5.3, h: 0.45, fontSize: 14, bold: true, color: C.green, fontFace: FONT })
  const solutions = [
    ['环境一致性', '本地开发 = 生产，消除"本地好使"'],
    ['长连接支持', '常驻进程，SSE / WebSocket 无限制'],
    ['文件持久化', '容器挂载卷，Vki 文件可持久存储'],
    ['自动重启',   '进程崩溃容器自动恢复，无需 PM2'],
    ['CI/CD 一体', 'push → 自动构建镜像 → 滚动部署'],
    ['按量计费',   'Railway 无流量不计费，成本可控'],
  ]
  solutions.forEach(([k, v], i) => {
    slide.addText(k, { x: 7.32, y: 2.28 + i * 0.68, w: 1.5, h: 0.56, fontSize: 11, bold: true, color: C.green, fontFace: FONT, valign: 'middle' })
    slide.addText(v, { x: 8.75, y: 2.28 + i * 0.68, w: 3.9, h: 0.56, fontSize: 11, color: C.text2, fontFace: FONT, valign: 'middle' })
  })
}

// ══════════════════════════════════════════════════════════════════════════════
// SLIDE 8 · 部署架构图
// ══════════════════════════════════════════════════════════════════════════════
{
  const slide = pptx.addSlide()
  setBg(slide)
  topLine(slide)
  sectionLabel(slide, 'DEPLOYMENT · 端到端部署链路')

  slide.addText('全链路部署架构', {
    x: 0.5, y: 0.65, w: 12, h: 0.65,
    fontSize: 26, bold: true, color: C.text, fontFace: FONT,
  })

  // Architecture nodes
  const nodes = [
    { label: '用户浏览器', sub: 'Chrome / Safari',  color: C.text2,    x: 0.2  },
    { label: 'Vercel CDN', sub: '全球边缘节点',       color: C.blue,     x: 2.4  },
    { label: 'Vue 3 SPA',  sub: '静态资源 + JS',     color: C.blue,     x: 4.6  },
    { label: 'Railway',    sub: 'Docker 容器',        color: C.orange,   x: 6.8  },
    { label: 'Express API', sub: 'Node.js 服务',     color: C.green,    x: 9.0  },
    { label: 'OpenAI API', sub: '用户自有 Endpoint', color: C.accentLt, x: 11.2 },
  ]

  nodes.forEach((n, i) => {
    card(slide, n.x, 2.5, 2.0, 1.2, C.bgCard, n.color)
    slide.addShape(pptx.ShapeType.rect, { x: n.x, y: 2.5, w: 2.0, h: 0.06, fill: { color: n.color } })
    slide.addText(n.label, { x: n.x + 0.1, y: 2.68, w: 1.8, h: 0.44, fontSize: 12, bold: true, color: n.color, fontFace: FONT })
    slide.addText(n.sub, { x: n.x + 0.1, y: 3.12, w: 1.8, h: 0.35, fontSize: 9.5, color: C.text3, fontFace: FONT })
    if (i < nodes.length - 1) {
      slide.addText('→', { x: n.x + 2.07, y: 2.9, w: 0.28, h: 0.35, fontSize: 18, color: C.text3, fontFace: FONT })
    }
  })

  // CI/CD bar
  card(slide, 2.8, 4.2, 8.2, 1.05, C.bgCard2, C.accent)
  slide.addShape(pptx.ShapeType.rect, { x: 2.8, y: 4.2, w: 8.2, h: 0.06, fill: { color: C.accent } })
  slide.addText('GitHub 自动化 CI/CD', { x: 3.02, y: 4.36, w: 7.8, h: 0.38, fontSize: 13, bold: true, color: C.accentLt, fontFace: FONT })
  slide.addText('git push  →  GitHub  →  Vercel 构建前端  +  Railway 构建 Docker 镜像  →  自动滚动部署（2–3 分钟）', {
    x: 3.02, y: 4.75, w: 7.8, h: 0.38,
    fontSize: 10.5, color: C.text2, fontFace: FONT,
  })

  // Request security chain
  card(slide, 0.4, 5.5, 12.5, 0.72, C.bgCard, C.green)
  slide.addText('🔒  请求链路：Vue App → Header(x-api-key, x-base-url) → Railway Express 接收 → 转发至用户指定 OpenAI Endpoint → SSE 流式结果返回', {
    x: 0.62, y: 5.5, w: 12.2, h: 0.72,
    fontSize: 10.5, color: C.text2, fontFace: FONT, valign: 'middle', wrap: true,
  })

  // Three projects mapping
  slide.addText('三款产品部署映射', { x: 0.5, y: 6.42, w: 3, h: 0.32, fontSize: 11, bold: true, color: C.text3, fontFace: FONT })
  const mappings = [
    { name: 'ai-chat',  front: 'Vercel',  back: 'Railway :3001', color: C.blue },
    { name: 'ai-image', front: 'Vercel',  back: 'Railway :3003', color: C.pink },
    { name: 'Vki',      front: 'local:5179', back: 'local:3004', color: C.accentLt },
  ]
  mappings.forEach((m, i) => {
    chip(slide, 3.5 + i * 3.2, 6.42, 3.0, 0.42, `${m.name}: ${m.front} + ${m.back}`, m.color)
  })
}

// ══════════════════════════════════════════════════════════════════════════════
// SLIDE 9 · 总结 & 下一步
// ══════════════════════════════════════════════════════════════════════════════
{
  const slide = pptx.addSlide()
  setBg(slide)
  topLine(slide)
  sectionLabel(slide, 'SUMMARY · 总结与展望')

  slide.addText('三款产品，一套体系，持续迭代', {
    x: 0.5, y: 0.65, w: 12, h: 0.7,
    fontSize: 28, bold: true, color: C.text, fontFace: FONT,
  })

  // Achievement numbers
  const achievements = [
    { num: '3', label: '款 AI 产品', sub: '对话 · 图像 · 知识库', color: C.accent },
    { num: '6', label: '类 Wiki 页面', sub: 'Vki 知识编译体系', color: C.accentLt },
    { num: '2', label: '套部署方案', sub: 'Vercel + Railway', color: C.blue },
    { num: '0', label: '数据库依赖', sub: '纯文件 / 纯代理设计', color: C.green },
  ]
  achievements.forEach((a, i) => {
    const x = 0.4 + i * 3.22
    card(slide, x, 1.55, 3.05, 2.3, C.bgCard, a.color)
    slide.addShape(pptx.ShapeType.rect, { x, y: 1.55, w: 3.05, h: 0.07, fill: { color: a.color } })
    slide.addText(a.num, { x: x + 0.18, y: 1.78, w: 2.7, h: 1.0, fontSize: 52, bold: true, color: a.color, fontFace: FONT })
    slide.addText(a.label, { x: x + 0.18, y: 2.75, w: 2.7, h: 0.4, fontSize: 13, bold: true, color: C.text, fontFace: FONT })
    slide.addText(a.sub, { x: x + 0.18, y: 3.15, w: 2.7, h: 0.35, fontSize: 10, color: C.text2, fontFace: FONT })
  })

  // Next steps
  card(slide, 0.4, 4.1, 12.5, 2.95, C.bgCard2, C.accent)
  slide.addText('下一步计划', { x: 0.62, y: 4.25, w: 3, h: 0.45, fontSize: 14, bold: true, color: C.accentLt, fontFace: FONT })
  const nexts = [
    { phase: 'Vki Phase 2', color: C.accentLt, items: ['D3.js 神经元可视化图谱', '笔记全文搜索', 'IndexedDB 图片持久化'] },
    { phase: 'Vki Phase 3', color: C.blue,     items: ['故事脚本一键生成', '人物画像导出', 'PPT 自动生成（集成）'] },
    { phase: '基础设施',    color: C.green,    items: ['Docker Compose 多服务编排', '生产级 PostgreSQL', 'WebSocket 实时协作'] },
  ]
  nexts.forEach((n, i) => {
    const x = 0.6 + i * 4.25
    slide.addText(n.phase, { x, y: 4.85, w: 3.9, h: 0.4, fontSize: 12, bold: true, color: n.color, fontFace: FONT })
    n.items.forEach((item, j) => {
      slide.addText('·  ' + item, { x, y: 5.35 + j * 0.5, w: 3.9, h: 0.44, fontSize: 10.5, color: C.text2, fontFace: FONT })
    })
  })

  slide.addText('Vue 3 + TypeScript + Express  ·  Vercel + Railway  ·  全栈自主交付', {
    x: 0.5, y: 7.15, w: 12, h: 0.3,
    fontSize: 10, color: C.text3, fontFace: FONT, align: 'center',
  })
}

// ── Save ──────────────────────────────────────────────────────────────────────
const outPath = path.join(__dirname, '..', 'AI产品矩阵_项目汇报.pptx')
await pptx.writeFile({ fileName: outPath })
console.log('✅  PPTX 已生成：', outPath)
