<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted, watch } from 'vue'

type NoteType = 'raw' | 'entity' | 'concept' | 'summary' | 'synthesis' | 'comparison' | 'qa'

interface NoteMeta {
  id: string
  type: NoteType
  title: string
  links: string[]
  sourceId?: string
  compiledAt?: string
}

const props = defineProps<{
  notes: NoteMeta[]
  compilingIds: Set<string>
}>()

const emit = defineEmits<{
  openNote: [id: string]
  compile: [id: string]
}>()

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

// Context menu
const ctxMenu = reactive({
  visible: false,
  x: 0, y: 0,
  nodeId: '',
  nodeTitle: '',
  nodeType: '' as NoteType | '',
})

let rafId: number | null = null
let ro: ResizeObserver | null = null
let gNodes: GNode[] = []
let gEdges: [number, number][] = []
let hovered: GNode | null = null
let dragNode: GNode | null = null
let dragMoved = false
let isPanning = false
let panStart = { x: 0, y: 0 }
let prevNoteIds = new Set<string>()

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
  const idToIdx   = new Map(props.notes.map((n, i) => [n.id, i]))
  const seen = new Set<string>()
  gEdges = []

  for (let i = 0; i < props.notes.length; i++) {
    for (const t of (props.notes[i].links || [])) {
      const j = titleToIdx.get(t)
      if (j !== undefined && j !== i) {
        const k = `${Math.min(i,j)},${Math.max(i,j)}`
        if (!seen.has(k)) { seen.add(k); gEdges.push([i, j]) }
      }
    }
    const srcId = props.notes[i].sourceId
    if (srcId) {
      const j = idToIdx.get(srcId)
      if (j !== undefined && j !== i) {
        const k = `${Math.min(i,j)},${Math.max(i,j)}`
        if (!seen.has(k)) { seen.add(k); gEdges.push([i, j]) }
      }
    }
  }

  nodeCount.value = gNodes.length
  edgeCount.value = gEdges.length
  prevNoteIds = new Set(props.notes.map(n => n.id))
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
      const d2 = dx*dx + dy*dy, d = Math.sqrt(d2) || 1
      const f = REP / d2
      fx[i] -= f*dx/d; fy[i] -= f*dy/d
      fx[j] += f*dx/d; fy[j] += f*dy/d
    }
  }
  for (const [i, j] of gEdges) {
    const dx = gNodes[j].x - gNodes[i].x
    const dy = gNodes[j].y - gNodes[i].y
    const d = Math.sqrt(dx*dx + dy*dy) || 1
    const f = SK * (d - SL)
    fx[i] += f*dx/d; fy[i] += f*dy/d
    fx[j] -= f*dx/d; fy[j] -= f*dy/d
  }
  for (let i = 0; i < n; i++) {
    fx[i] += CK * (W/2 - gNodes[i].x)
    fy[i] += CK * (H/2 - gNodes[i].y)
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
  const sp = 26
  ctx.fillStyle = 'rgba(255,255,255,0.1)'
  const ox = ((tr.x % sp) + sp) % sp
  const oy = ((tr.y % sp) + sp) % sp
  for (let x = ox - sp; x < W + sp; x += sp)
    for (let y = oy - sp; y < H + sp; y += sp) {
      ctx.beginPath()
      ctx.arc(x, y, 1.2, 0, Math.PI * 2)
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
    ctx.strokeStyle = lit ? 'rgba(129,140,248,0.85)' : 'rgba(129,140,248,0.22)'
    ctx.lineWidth = (lit ? 1.8 : 1) / tr.s
    ctx.beginPath()
    ctx.moveTo(gNodes[i].x, gNodes[i].y)
    ctx.lineTo(gNodes[j].x, gNodes[j].y)
    ctx.stroke()
  }

  // Nodes
  const showLabels = gNodes.length <= 60 || tr.s > 1.3
  const now = Date.now()

  for (let i = 0; i < gNodes.length; i++) {
    const nd = gNodes[i]
    const isH = nd === hovered
    const isC = connected.has(i)
    const dimmed = hi >= 0 && !isH && !isC
    const isCompiling = props.compilingIds.has(nd.id)
    const color = TYPE_COLORS[nd.type]
    const r = isH ? 9 : isC ? 7 : 5

    ctx.globalAlpha = dimmed ? 0.18 : 1

    // Compiling pulse ring
    if (isCompiling) {
      const pulse = (Math.sin(now / 280) + 1) / 2
      const pr = r + 5 + pulse * 9
      ctx.beginPath()
      ctx.arc(nd.x, nd.y, pr, 0, Math.PI * 2)
      ctx.fillStyle = color + '28'
      ctx.fill()
      ctx.strokeStyle = color + '66'
      ctx.lineWidth = 1.2 / tr.s
      ctx.stroke()
    }

    // Hover glow
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

    // "Raw uncompiled" indicator ring
    if (nd.type === 'raw') {
      ctx.strokeStyle = color + '55'
      ctx.lineWidth = 1 / tr.s
      ctx.beginPath()
      ctx.arc(nd.x, nd.y, r + 2.5, 0, Math.PI * 2)
      ctx.stroke()
    }

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
  const hr = 12 / tr.s
  for (let i = gNodes.length - 1; i >= 0; i--) {
    const dx = gNodes[i].x - wx, dy = gNodes[i].y - wy
    if (dx*dx + dy*dy < hr*hr) return gNodes[i]
  }
  return null
}

function getPos(e: MouseEvent): [number, number] {
  const r = canvasRef.value!.getBoundingClientRect()
  return [e.clientX - r.left, e.clientY - r.top]
}

function closeCtxMenu() { ctxMenu.visible = false }

function onContextMenu(e: MouseEvent) {
  e.preventDefault()
  const [sx, sy] = getPos(e)
  const [wx, wy] = screenToWorld(sx, sy)
  const hit = hitTest(wx, wy)
  if (!hit) { closeCtxMenu(); return }

  const c = canvasRef.value!
  // Clamp menu to canvas bounds
  const menuW = 200, menuH = 130
  ctxMenu.x = Math.min(sx, c.offsetWidth  - menuW)
  ctxMenu.y = Math.min(sy, c.offsetHeight - menuH)
  ctxMenu.nodeId    = hit.id
  ctxMenu.nodeTitle = hit.title
  ctxMenu.nodeType  = hit.type
  ctxMenu.visible   = true
}

function onMouseDown(e: MouseEvent) {
  closeCtxMenu()
  const [sx, sy] = getPos(e)
  const [wx, wy] = screenToWorld(sx, sy)
  const hit = hitTest(wx, wy)
  if (hit) {
    dragNode = hit; dragMoved = false
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
  if (isPanning) { isPanning = false; canvasRef.value!.style.cursor = 'default' }
}

function onWheel(e: WheelEvent) {
  e.preventDefault()
  const [sx, sy] = getPos(e)
  // Gentler zoom: 0.95 / 1.053 instead of 0.9 / 1.11
  const factor = e.deltaY > 0 ? 0.95 : 1.053
  const ns = Math.max(0.12, Math.min(5, tr.s * factor))
  tr.x = sx - (sx - tr.x) * (ns / tr.s)
  tr.y = sy - (sy - tr.y) * (ns / tr.s)
  tr.s = ns
}

function onMouseLeave() {
  hovered = null; dragNode = null; isPanning = false
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

// When new notes arrive (after compile): preserve positions, spawn new nodes from source
watch(() => props.notes.length, () => {
  const c = canvasRef.value
  if (!c) return

  const posMap = new Map(gNodes.map(n => [n.id, { x: n.x, y: n.y, vx: n.vx, vy: n.vy }]))
  buildGraph(c.width, c.height)

  for (const node of gNodes) {
    const saved = posMap.get(node.id)
    if (saved) {
      node.x = saved.x; node.y = saved.y; node.vx = saved.vx; node.vy = saved.vy
    } else {
      // New node: spawn from source position with burst velocity
      const note = props.notes.find(n => n.id === node.id)
      const srcId = note?.sourceId
      if (srcId) {
        const src = gNodes.find(n => n.id === srcId) || posMap.get(srcId)
        if (src) {
          node.x = src.x; node.y = src.y
          const angle = Math.random() * Math.PI * 2
          const speed = 5 + Math.random() * 8
          node.vx = Math.cos(angle) * speed
          node.vy = Math.sin(angle) * speed
        }
      }
    }
  }
})

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
      @contextmenu="onContextMenu"
    />

    <!-- Context Menu -->
    <Teleport to="body">
      <div v-if="ctxMenu.visible" class="ctx-backdrop" @mousedown="closeCtxMenu" />
      <div
        v-if="ctxMenu.visible"
        class="ctx-menu"
        :style="{ left: ctxMenu.x + 'px', top: ctxMenu.y + 'px' }"
        @mousedown.stop
      >
        <div class="ctx-title">{{ ctxMenu.nodeTitle }}</div>
        <div class="ctx-divider" />
        <button
          v-if="ctxMenu.nodeType === 'raw'"
          class="ctx-item ctx-primary"
          :disabled="compilingIds.has(ctxMenu.nodeId)"
          @click="emit('compile', ctxMenu.nodeId); closeCtxMenu()"
        >
          <span v-if="compilingIds.has(ctxMenu.nodeId)">⟳&nbsp; 生成中...</span>
          <span v-else>✦&nbsp; 生成延伸神经元</span>
        </button>
        <button class="ctx-item" @click="emit('openNote', ctxMenu.nodeId); closeCtxMenu()">
          → 打开笔记
        </button>
      </div>
    </Teleport>

    <div class="graph-hint">
      {{ nodeCount }} 个笔记 &nbsp;·&nbsp; {{ edgeCount }} 条链接
      &nbsp;·&nbsp; 右键节点操作 &nbsp;·&nbsp; 滚轮缩放 &nbsp;·&nbsp; 拖拽移动
    </div>

    <div class="graph-legend">
      <div v-for="(color, type) in TYPE_COLORS" :key="type" class="legend-item">
        <span class="legend-dot" :style="{ background: color }" />
        <span>{{ TYPE_LABELS[type as NoteType] }}</span>
      </div>
    </div>

    <div v-if="!nodeCount" class="graph-empty">
      暂无笔记 — 创建并编译后将在此显示知识图谱
    </div>
  </div>
</template>

<style scoped>
.graph-wrap {
  width: 100%;
  height: 100%;
  position: relative;
  background: #0A0D14;
  overflow: hidden;
}

.graph-canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.graph-hint {
  position: absolute;
  top: 14px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 11px;
  color: rgba(148, 163, 184, 0.6);
  pointer-events: none;
  white-space: nowrap;
  background: rgba(10, 13, 20, 0.75);
  padding: 4px 14px;
  border-radius: 99px;
  border: 1px solid rgba(255,255,255,0.06);
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
  background: rgba(15, 18, 28, 0.88);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 12px;
  font-size: 11px;
  color: rgba(148,163,184,0.75);
  backdrop-filter: blur(8px);
}

.legend-item { display: flex; align-items: center; gap: 7px; }
.legend-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }

.graph-empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: rgba(100,116,139,0.6);
  pointer-events: none;
}
</style>

<!-- Context menu styles in global scope via Teleport -->
<style>
.ctx-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9998;
}

.ctx-menu {
  position: fixed;
  z-index: 9999;
  background: #141720;
  border: 1px solid rgba(99,102,241,0.25);
  border-radius: 10px;
  padding: 6px;
  min-width: 190px;
  box-shadow: 0 12px 32px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04) inset;
  backdrop-filter: blur(12px);
}

.ctx-title {
  font-size: 11px;
  color: rgba(148,163,184,0.55);
  padding: 4px 10px 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 180px;
}

.ctx-divider {
  height: 1px;
  background: rgba(255,255,255,0.07);
  margin: 2px 0 4px;
}

.ctx-item {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 8px 12px;
  background: transparent;
  border: none;
  border-radius: 7px;
  color: #CBD5E1;
  font-size: 13px;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.ctx-item:hover { background: rgba(255,255,255,0.06); color: #F1F5F9; }
.ctx-item:disabled { opacity: 0.5; cursor: default; }

.ctx-primary { color: #A5B4FC; }
.ctx-primary:hover { background: rgba(99,102,241,0.15); color: #C7D2FE; }
</style>
