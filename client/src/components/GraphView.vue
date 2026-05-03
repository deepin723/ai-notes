<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'

type NoteType = 'raw' | 'entity' | 'concept' | 'summary' | 'synthesis' | 'comparison' | 'qa'

interface NoteMeta {
  id: string
  type: NoteType
  title: string
  links: string[]
  sourceId?: string
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
const nodeCount = ref(0)
const edgeCount = ref(0)

let rafId: number | null = null
let ro: ResizeObserver | null = null
let gNodes: GNode[] = []
let gEdges: [number, number][] = []
let hovered: GNode | null = null
let dragNode: GNode | null = null
let dragMoved = false
let isPanning = false
let panStart = { x: 0, y: 0 }

// World transform
const tr = { x: 0, y: 0, s: 1 }

function screenToWorld(sx: number, sy: number): [number, number] {
  return [(sx - tr.x) / tr.s, (sy - tr.y) / tr.s]
}

function buildGraph(W: number, H: number) {
  gNodes = props.notes.map(n => ({
    id: n.id, title: n.title, type: n.type,
    x: W / 2 + (Math.random() - 0.5) * Math.min(W, H) * 0.55,
    y: H / 2 + (Math.random() - 0.5) * Math.min(W, H) * 0.55,
    vx: 0, vy: 0,
  }))

  const titleToIdx = new Map(props.notes.map((n, i) => [n.title, i]))
  const idToIdx = new Map(props.notes.map((n, i) => [n.id, i]))
  const seen = new Set<string>()
  gEdges = []

  for (let i = 0; i < props.notes.length; i++) {
    // From links[] (wikilink titles)
    for (const t of (props.notes[i].links || [])) {
      const j = titleToIdx.get(t)
      if (j !== undefined && j !== i) {
        const k = `${Math.min(i, j)},${Math.max(i, j)}`
        if (!seen.has(k)) { seen.add(k); gEdges.push([i, j]) }
      }
    }
    // From sourceId (compiled pages → raw source note)
    const srcId = (props.notes[i] as any).sourceId
    if (srcId) {
      const j = idToIdx.get(srcId)
      if (j !== undefined && j !== i) {
        const k = `${Math.min(i, j)},${Math.max(i, j)}`
        if (!seen.has(k)) { seen.add(k); gEdges.push([i, j]) }
      }
    }
  }

  nodeCount.value = gNodes.length
  edgeCount.value = gEdges.length
  tr.x = 0; tr.y = 0; tr.s = 1
}

function simulate(W: number, H: number) {
  const n = gNodes.length
  if (!n) return
  const REP = 2800, SL = 150, SK = 0.02, DAMP = 0.82, CK = 0.006
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
    gNodes[i].x += gNodes[i].vx
    gNodes[i].y += gNodes[i].vy
  }
}

function drawGrid(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const sp = 28
  ctx.fillStyle = 'rgba(255,255,255,0.055)'
  const ox = ((tr.x % sp) + sp) % sp
  const oy = ((tr.y % sp) + sp) % sp
  for (let x = ox - sp; x < W + sp; x += sp)
    for (let y = oy - sp; y < H + sp; y += sp) {
      ctx.beginPath()
      ctx.arc(x, y, 0.85, 0, Math.PI * 2)
      ctx.fill()
    }
}

function draw(ctx: CanvasRenderingContext2D, W: number, H: number) {
  ctx.clearRect(0, 0, W, H)
  drawGrid(ctx, W, H)

  ctx.save()
  ctx.translate(tr.x, tr.y)
  ctx.scale(tr.s, tr.s)

  const hi = hovered ? gNodes.indexOf(hovered) : -1
  const connected = new Set<number>()
  if (hi >= 0) {
    for (const [a, b] of gEdges) {
      if (a === hi) connected.add(b)
      else if (b === hi) connected.add(a)
    }
  }

  // Edges
  for (const [i, j] of gEdges) {
    const lit = hi >= 0 && (i === hi || j === hi)
    ctx.strokeStyle = lit ? 'rgba(129,140,248,0.85)' : 'rgba(129,140,248,0.2)'
    ctx.lineWidth = (lit ? 1.8 : 1) / tr.s
    ctx.beginPath()
    ctx.moveTo(gNodes[i].x, gNodes[i].y)
    ctx.lineTo(gNodes[j].x, gNodes[j].y)
    ctx.stroke()
  }

  // Nodes
  const showLabels = gNodes.length <= 60 || tr.s > 1.3
  for (let i = 0; i < gNodes.length; i++) {
    const nd = gNodes[i]
    const isH = nd === hovered
    const isC = connected.has(i)
    const dimmed = hi >= 0 && !isH && !isC
    const color = TYPE_COLORS[nd.type]
    const r = isH ? 9 : isC ? 7 : 5

    ctx.globalAlpha = dimmed ? 0.18 : 1

    if (isH) {
      const g = ctx.createRadialGradient(nd.x, nd.y, 0, nd.x, nd.y, r + 14)
      g.addColorStop(0, color + '99')
      g.addColorStop(1, color + '00')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(nd.x, nd.y, r + 14, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.beginPath()
    ctx.arc(nd.x, nd.y, r, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()

    if (showLabels || isH || isC) {
      ctx.font = `${isH ? 500 : 400} 11px system-ui, -apple-system, sans-serif`
      ctx.fillStyle = isH ? '#F1F5F9' : isC ? '#CBD5E1' : '#64748B'
      const label = nd.title.length > 20 ? nd.title.slice(0, 19) + '…' : nd.title
      ctx.fillText(label, nd.x + r + 6, nd.y + 4)
    }

    ctx.globalAlpha = 1
  }

  ctx.restore()
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

function hitTest(wx: number, wy: number): GNode | null {
  const hitR = 12 / tr.s
  for (let i = gNodes.length - 1; i >= 0; i--) {
    const dx = gNodes[i].x - wx, dy = gNodes[i].y - wy
    if (dx * dx + dy * dy < hitR * hitR) return gNodes[i]
  }
  return null
}

function getPos(e: MouseEvent): [number, number] {
  const r = canvasRef.value!.getBoundingClientRect()
  return [e.clientX - r.left, e.clientY - r.top]
}

function onMouseDown(e: MouseEvent) {
  const [sx, sy] = getPos(e)
  const [wx, wy] = screenToWorld(sx, sy)
  const hit = hitTest(wx, wy)
  if (hit) {
    dragNode = hit
    dragMoved = false
  } else {
    isPanning = true
    panStart = { x: e.clientX - tr.x, y: e.clientY - tr.y }
    canvasRef.value!.style.cursor = 'grab'
  }
}

function onMouseMove(e: MouseEvent) {
  const [sx, sy] = getPos(e)
  if (dragNode) {
    const [wx, wy] = screenToWorld(sx, sy)
    dragNode.x = wx; dragNode.y = wy; dragNode.vx = 0; dragNode.vy = 0
    dragMoved = true
    canvasRef.value!.style.cursor = 'grabbing'
    return
  }
  if (isPanning) {
    tr.x = e.clientX - panStart.x
    tr.y = e.clientY - panStart.y
    canvasRef.value!.style.cursor = 'grabbing'
    return
  }
  const [wx, wy] = screenToWorld(sx, sy)
  hovered = hitTest(wx, wy)
  canvasRef.value!.style.cursor = hovered ? 'pointer' : 'default'
}

function onMouseUp() {
  if (dragNode && !dragMoved) emit('openNote', dragNode.id)
  dragNode = null
  if (isPanning) {
    isPanning = false
    canvasRef.value!.style.cursor = 'default'
  }
}

function onWheel(e: WheelEvent) {
  e.preventDefault()
  const [sx, sy] = getPos(e)
  const factor = e.deltaY > 0 ? 0.9 : 1.11
  const ns = Math.max(0.12, Math.min(5, tr.s * factor))
  tr.x = sx - (sx - tr.x) * (ns / tr.s)
  tr.y = sy - (sy - tr.y) * (ns / tr.s)
  tr.s = ns
}

function onMouseLeave() {
  hovered = null
  dragNode = null
  isPanning = false
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
  canvasRef.value?.addEventListener('wheel', onWheel, { passive: false })
  ro = new ResizeObserver(initCanvas)
  ro.observe(canvasRef.value!)
})

onUnmounted(() => {
  if (rafId !== null) cancelAnimationFrame(rafId)
  canvasRef.value?.removeEventListener('wheel', onWheel)
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

    <div class="graph-hint">
      {{ nodeCount }} 个笔记 &nbsp;·&nbsp; {{ edgeCount }} 条链接
      &nbsp;·&nbsp; 滚轮缩放 &nbsp;·&nbsp; 拖拽移动画布
    </div>

    <div class="graph-legend">
      <div v-for="(color, type) in TYPE_COLORS" :key="type" class="legend-item">
        <span class="legend-dot" :style="{ background: color }" />
        <span>{{ TYPE_LABELS[type as NoteType] }}</span>
      </div>
    </div>

    <div v-if="!nodeCount" class="graph-empty">
      暂无笔记，创建并编译后将在此显示知识图谱
    </div>
  </div>
</template>

<style scoped>
.graph-wrap {
  width: 100%;
  height: 100%;
  position: relative;
  background: var(--bg);
  overflow: hidden;
}

.graph-canvas {
  display: block;
  width: 100%;
  height: 100%;
  cursor: default;
}

.graph-hint {
  position: absolute;
  top: 14px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 11px;
  color: var(--text-3);
  pointer-events: none;
  white-space: nowrap;
  background: rgba(10, 13, 20, 0.7);
  padding: 4px 12px;
  border-radius: 99px;
  border: 1px solid var(--border);
  backdrop-filter: blur(8px);
}

.graph-legend {
  position: absolute;
  bottom: 20px;
  right: 20px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 10px 14px;
  background: rgba(15, 18, 28, 0.85);
  border: 1px solid var(--border);
  border-radius: 12px;
  font-size: 11px;
  color: var(--text-2);
  backdrop-filter: blur(8px);
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
