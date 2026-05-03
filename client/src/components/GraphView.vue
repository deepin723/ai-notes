<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'

type NoteType = 'raw' | 'entity' | 'concept' | 'summary' | 'synthesis' | 'comparison' | 'qa'

interface NoteMeta {
  id: string
  type: NoteType
  title: string
  links: string[]
}

const props = defineProps<{ notes: NoteMeta[] }>()
const emit = defineEmits<{ openNote: [id: string] }>()

const TYPE_COLORS: Record<NoteType, string> = {
  raw: '#94A3B8', entity: '#F472B6', concept: '#60A5FA',
  summary: '#34D399', synthesis: '#A78BFA', comparison: '#FBBF24', qa: '#FB923C',
}
const TYPE_LABELS: Record<NoteType, string> = {
  raw: '原始笔记', entity: '实体', concept: '概念',
  summary: '摘要', synthesis: '综合', comparison: '对比', qa: '问答',
}

interface GNode { id: string; title: string; type: NoteType; x: number; y: number; vx: number; vy: number }

const canvasRef = ref<HTMLCanvasElement | null>(null)
let rafId: number | null = null
let ro: ResizeObserver | null = null
let gNodes: GNode[] = []
let gEdges: [number, number][] = []
let hovered: GNode | null = null
let dragNode: GNode | null = null
let dragMoved = false

function buildGraph(W: number, H: number) {
  const cx = W / 2, cy = H / 2
  const spread = Math.min(W, H) * 0.35
  gNodes = props.notes.map(n => ({
    id: n.id, title: n.title, type: n.type,
    x: cx + (Math.random() - 0.5) * spread * 2,
    y: cy + (Math.random() - 0.5) * spread * 2,
    vx: 0, vy: 0,
  }))
  const titleToIdx = new Map(props.notes.map((n, i) => [n.title, i]))
  const seen = new Set<string>()
  gEdges = []
  for (let i = 0; i < props.notes.length; i++) {
    for (const t of (props.notes[i].links || [])) {
      const j = titleToIdx.get(t)
      if (j !== undefined && j !== i) {
        const key = `${Math.min(i, j)},${Math.max(i, j)}`
        if (!seen.has(key)) { seen.add(key); gEdges.push([i, j]) }
      }
    }
  }
}

function simulate(W: number, H: number) {
  const n = gNodes.length
  if (!n) return
  const REP = 2500, SL = 140, SK = 0.022, DAMP = 0.82, CK = 0.008
  const fx = new Float32Array(n), fy = new Float32Array(n)

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = (gNodes[j].x - gNodes[i].x) || 0.01
      const dy = (gNodes[j].y - gNodes[i].y) || 0.01
      const d2 = dx * dx + dy * dy, d = Math.sqrt(d2) || 1
      const f = REP / d2
      fx[i] -= f * dx / d; fy[i] -= f * dy / d
      fx[j] += f * dx / d; fy[j] += f * dy / d
    }
  }
  for (const [i, j] of gEdges) {
    const dx = gNodes[j].x - gNodes[i].x
    const dy = gNodes[j].y - gNodes[i].y
    const d = Math.sqrt(dx * dx + dy * dy) || 1
    const f = SK * (d - SL)
    fx[i] += f * dx / d; fy[i] += f * dy / d
    fx[j] -= f * dx / d; fy[j] -= f * dy / d
  }
  for (let i = 0; i < n; i++) {
    fx[i] += CK * (W / 2 - gNodes[i].x)
    fy[i] += CK * (H / 2 - gNodes[i].y)
  }
  for (let i = 0; i < n; i++) {
    if (gNodes[i] === dragNode) continue
    gNodes[i].vx = (gNodes[i].vx + fx[i]) * DAMP
    gNodes[i].vy = (gNodes[i].vy + fy[i]) * DAMP
    gNodes[i].x = Math.max(24, Math.min(W - 24, gNodes[i].x + gNodes[i].vx))
    gNodes[i].y = Math.max(24, Math.min(H - 24, gNodes[i].y + gNodes[i].vy))
  }
}

function draw(ctx: CanvasRenderingContext2D, W: number, H: number) {
  ctx.clearRect(0, 0, W, H)
  const hi = hovered ? gNodes.indexOf(hovered) : -1
  const connected = new Set<number>()
  if (hi >= 0) {
    for (const [a, b] of gEdges) {
      if (a === hi) connected.add(b)
      else if (b === hi) connected.add(a)
    }
  }

  for (const [i, j] of gEdges) {
    const lit = hi >= 0 && (i === hi || j === hi)
    ctx.strokeStyle = lit ? 'rgba(129,140,248,0.65)' : 'rgba(129,140,248,0.16)'
    ctx.lineWidth = lit ? 1.6 : 1
    ctx.beginPath()
    ctx.moveTo(gNodes[i].x, gNodes[i].y)
    ctx.lineTo(gNodes[j].x, gNodes[j].y)
    ctx.stroke()
  }

  const showLabels = gNodes.length <= 50
  for (let i = 0; i < gNodes.length; i++) {
    const nd = gNodes[i]
    const isH = nd === hovered
    const isC = connected.has(i)
    const dimmed = hi >= 0 && !isH && !isC
    const color = TYPE_COLORS[nd.type]
    const r = isH ? 8 : isC ? 6 : 5

    ctx.globalAlpha = dimmed ? 0.22 : 1

    if (isH) {
      const g = ctx.createRadialGradient(nd.x, nd.y, 0, nd.x, nd.y, r + 10)
      g.addColorStop(0, color + 'aa')
      g.addColorStop(1, color + '00')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(nd.x, nd.y, r + 10, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.beginPath()
    ctx.arc(nd.x, nd.y, r, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()

    if (showLabels || isH || isC) {
      ctx.font = `${isH ? '12px' : '11px'} system-ui, -apple-system, sans-serif`
      ctx.fillStyle = isH ? '#F1F5F9' : isC ? '#CBD5E1' : '#64748B'
      const label = nd.title.length > 18 ? nd.title.slice(0, 17) + '…' : nd.title
      ctx.fillText(label, nd.x + r + 5, nd.y + 4)
    }

    ctx.globalAlpha = 1
  }
}

function loop() {
  const c = canvasRef.value
  if (!c) return
  const ctx = c.getContext('2d')
  if (!ctx) return
  simulate(c.width, c.height)
  draw(ctx, c.width, c.height)
  rafId = requestAnimationFrame(loop)
}

function hitTest(x: number, y: number): GNode | null {
  for (let i = gNodes.length - 1; i >= 0; i--) {
    const dx = gNodes[i].x - x, dy = gNodes[i].y - y
    if (dx * dx + dy * dy < 100) return gNodes[i]
  }
  return null
}

function getPos(e: MouseEvent): [number, number] {
  const r = canvasRef.value!.getBoundingClientRect()
  return [e.clientX - r.left, e.clientY - r.top]
}

function onMouseMove(e: MouseEvent) {
  const [x, y] = getPos(e)
  if (dragNode) {
    dragNode.x = x; dragNode.y = y; dragNode.vx = 0; dragNode.vy = 0
    dragMoved = true
    canvasRef.value!.style.cursor = 'grabbing'
    return
  }
  hovered = hitTest(x, y)
  canvasRef.value!.style.cursor = hovered ? 'pointer' : 'default'
}

function onMouseDown(e: MouseEvent) {
  const [x, y] = getPos(e)
  dragNode = hitTest(x, y)
  dragMoved = false
}

function onMouseUp() {
  if (dragNode && !dragMoved) emit('openNote', dragNode.id)
  dragNode = null
}

function onMouseLeave() {
  hovered = null
  dragNode = null
}

function initCanvas() {
  const c = canvasRef.value
  if (!c) return
  c.width = c.offsetWidth
  c.height = c.offsetHeight
  buildGraph(c.width, c.height)
  if (rafId !== null) cancelAnimationFrame(rafId)
  loop()
}

onMounted(() => {
  initCanvas()
  ro = new ResizeObserver(initCanvas)
  ro.observe(canvasRef.value!)
})

onUnmounted(() => {
  if (rafId !== null) cancelAnimationFrame(rafId)
  ro?.disconnect()
})

watch(() => props.notes.length, () => {
  const c = canvasRef.value
  if (c) buildGraph(c.width, c.height)
})
</script>

<template>
  <div class="graph-wrap">
    <canvas
      ref="canvasRef"
      class="graph-canvas"
      @mousemove="onMouseMove"
      @mousedown="onMouseDown"
      @mouseup="onMouseUp"
      @mouseleave="onMouseLeave"
    />
    <div class="graph-hint">{{ gNodes.length }} 个笔记 · {{ gEdges.length }} 条链接 · 点击节点打开 · 拖拽可移动</div>
    <div class="graph-legend">
      <div v-for="(color, type) in TYPE_COLORS" :key="type" class="legend-item">
        <span class="legend-dot" :style="{ background: color }" />
        <span>{{ TYPE_LABELS[type as NoteType] }}</span>
      </div>
    </div>
    <div v-if="!gNodes.length" class="graph-empty">暂无笔记，创建并编译后将在此显示知识图谱</div>
  </div>
</template>

<style scoped>
.graph-wrap {
  width: 100%;
  height: 100%;
  position: relative;
  background: var(--bg);
}

.graph-canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.graph-hint {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 11px;
  color: var(--text-3);
  pointer-events: none;
  white-space: nowrap;
}

.graph-legend {
  position: absolute;
  bottom: 20px;
  right: 20px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 10px 14px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
  font-size: 11px;
  color: var(--text-2);
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 7px;
}

.legend-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.graph-empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: var(--text-3);
  pointer-events: none;
}
</style>
