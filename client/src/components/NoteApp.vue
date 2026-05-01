<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { marked } from 'marked'

const props = defineProps<{ apiKey: string; baseUrl: string }>()
const emit = defineEmits<{ settings: [] }>()

// ── Types ──────────────────────────────────────────────────────────────────
type NoteType = 'raw' | 'entity' | 'concept' | 'summary' | 'synthesis' | 'comparison' | 'qa'
type ViewMode = 'list' | 'editor' | 'viewer'

interface NoteMeta {
  id: string
  type: NoteType
  title: string
  tags: string[]
  links: string[]
  sourceId?: string
  compiledAt?: string
  created: string
  updated: string
  preview?: string
}

interface NoteDetail extends NoteMeta {
  content: string
}

// ── Constants ──────────────────────────────────────────────────────────────
const TYPE_LABELS: Record<NoteType | 'all', string> = {
  all: '全部', raw: '原始笔记', entity: '实体', concept: '概念',
  summary: '摘要', synthesis: '综合', comparison: '对比', qa: '问答',
}

const TYPE_ICONS: Record<NoteType | 'all', string> = {
  all: '◈', raw: '✎', entity: '◉', concept: '◎',
  summary: '≡', synthesis: '⊕', comparison: '⇄', qa: '?',
}

const TYPE_COLORS: Record<NoteType, string> = {
  raw: '#94A3B8', entity: '#F472B6', concept: '#60A5FA',
  summary: '#34D399', synthesis: '#A78BFA', comparison: '#FBBF24', qa: '#FB923C',
}

const COMPILE_MSGS = [
  '正在解析笔记结构...',
  'AI 编译知识页面中...',
  '构建神经元链接...',
  '即将完成...',
]

// ── Core State ────────────────────────────────────────────────────────────
const view           = ref<ViewMode>('list')
const selectedType   = ref<NoteType | 'all'>('all')
const notes          = ref<NoteMeta[]>([])
const currentNote    = ref<NoteDetail | null>(null)
const isLoading      = ref(false)
const isCompiling    = ref(false)
const compileMsgIdx  = ref(0)
const compiledPages  = ref<{ id: string; type: NoteType; title: string }[]>([])

// Editor state
const editorTitle    = ref('')
const editorContent  = ref('')
const editorTags     = ref('')
const editorError    = ref('')
const editingId      = ref<string | null>(null)
const contentRef     = ref<HTMLTextAreaElement | null>(null)

// ── Toast System ──────────────────────────────────────────────────────────
interface Toast { id: number; message: string; type: 'success' | 'error' | 'info' }
const toasts = ref<Toast[]>([])
let toastCounter = 0

const showToast = (message: string, type: Toast['type'] = 'success') => {
  const id = ++toastCounter
  toasts.value.push({ id, message, type })
  setTimeout(() => { toasts.value = toasts.value.filter(t => t.id !== id) }, 2500)
}

// ── Search & Filter ───────────────────────────────────────────────────────
const searchQuery    = ref('')
const searchInputRef = ref<HTMLInputElement | null>(null)
const activeTag      = ref<string | null>(null)

// ── Compile Progress ──────────────────────────────────────────────────────
const compileProgress = ref(0)
let compileProgressTimer: ReturnType<typeof setInterval> | null = null

// ── Copy State ────────────────────────────────────────────────────────────
const copiedNote = ref(false)

// ── Computed ───────────────────────────────────────────────────────────────
const filteredNotes = computed(() => {
  let r = notes.value
  if (selectedType.value !== 'all') r = r.filter(n => n.type === selectedType.value)
  if (activeTag.value) r = r.filter(n => n.tags?.includes(activeTag.value!))
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase()
    r = r.filter(n =>
      n.title.toLowerCase().includes(q) ||
      n.tags?.some(t => t.toLowerCase().includes(q))
    )
  }
  return r
})

const typeCounts = computed(() => {
  const counts: Record<string, number> = {}
  for (const n of notes.value) {
    counts[n.type] = (counts[n.type] || 0) + 1
  }
  return counts
})

const topTags = computed(() => {
  const counts: Record<string, number> = {}
  for (const n of notes.value)
    for (const t of (n.tags || []))
      counts[t] = (counts[t] || 0) + 1
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 14)
    .map(([tag, count]) => ({ tag, count }))
})

const wordCount = computed(() => ({
  chars: editorContent.value.length,
  words: editorContent.value.trim() ? editorContent.value.trim().split(/\s+/).length : 0,
}))

const renderedPreview = computed(() => renderMarkdown(editorContent.value))

// ── API Helpers ────────────────────────────────────────────────────────────
const headers = () => ({
  'Content-Type': 'application/json',
  'x-api-key':  props.apiKey,
  'x-base-url': props.baseUrl,
})

const fetchNotes = async () => {
  isLoading.value = true
  try {
    const res = await fetch('/api/notes')
    notes.value = await res.json()
  } finally {
    isLoading.value = false
  }
}

const openNote = async (id: string) => {
  const res = await fetch(`/api/notes/${id}`)
  currentNote.value = await res.json()
  compiledPages.value = []
  compileProgress.value = 0
  view.value = 'viewer'
}

const saveNote = async () => {
  if (!editorTitle.value.trim()) { editorError.value = '请输入标题'; return }
  editorError.value = ''
  const tags = editorTags.value.split(/[,，\s]+/).map(t => t.trim()).filter(Boolean)
  const wasEditing = editingId.value
  try {
    if (editingId.value) {
      await fetch(`/api/notes/${editingId.value}`, {
        method: 'PUT',
        headers: headers(),
        body: JSON.stringify({ title: editorTitle.value, content: editorContent.value, tags }),
      })
    } else {
      await fetch('/api/notes', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ title: editorTitle.value, content: editorContent.value, tags }),
      })
    }
    await fetchNotes()
    view.value = 'list'
    resetEditor()
    showToast(wasEditing ? '笔记已更新' : '笔记已保存')
  } catch {
    showToast('保存失败，请重试', 'error')
  }
}

const deleteNote = async (id: string) => {
  try {
    await fetch(`/api/notes/${id}`, { method: 'DELETE' })
    await fetchNotes()
    view.value = 'list'
    currentNote.value = null
    showToast('笔记已删除')
  } catch {
    showToast('删除失败', 'error')
  }
}

const compileNote = async () => {
  if (!currentNote.value) return
  isCompiling.value = true
  compileMsgIdx.value = 0
  compiledPages.value = []
  compileProgress.value = 0

  compileProgressTimer = setInterval(() => {
    if (compileProgress.value < 88) {
      const inc = Math.max(0.3, (88 - compileProgress.value) / 30)
      compileProgress.value = Math.min(88, compileProgress.value + inc)
    }
  }, 800)

  const mt = setInterval(() => {
    compileMsgIdx.value = (compileMsgIdx.value + 1) % COMPILE_MSGS.length
  }, 2500)

  try {
    const res = await fetch(`/api/compile/${currentNote.value.id}`, {
      method: 'POST',
      headers: headers(),
    })
    const data = await res.json()
    clearInterval(compileProgressTimer!)
    clearInterval(mt)
    compileProgressTimer = null

    if (data.pages) {
      compileProgress.value = 100
      compiledPages.value = data.pages
      await fetchNotes()
      const updated = await fetch(`/api/notes/${currentNote.value.id}`)
      currentNote.value = await updated.json()
      showToast(`已生成 ${data.pages.length} 个 Wiki 页面`)
    } else {
      compileProgress.value = 0
      showToast(data.error || '编译失败，请重试', 'error')
    }
  } catch {
    if (compileProgressTimer) clearInterval(compileProgressTimer)
    clearInterval(mt)
    compileProgressTimer = null
    compileProgress.value = 0
    showToast('网络错误，请稍后重试', 'error')
  } finally {
    isCompiling.value = false
  }
}

// ── Copy Note Content ─────────────────────────────────────────────────────
const copyNoteContent = async () => {
  if (!currentNote.value) return
  try {
    await navigator.clipboard.writeText(currentNote.value.content)
    copiedNote.value = true
    showToast('内容已复制到剪贴板')
    setTimeout(() => { copiedNote.value = false }, 2000)
  } catch {
    showToast('复制失败', 'error')
  }
}

// ── Markdown Toolbar ──────────────────────────────────────────────────────
const insertMarkdown = (prefix: string, suffix = '', blockMode = false) => {
  const el = contentRef.value
  if (!el) return
  const start   = el.selectionStart
  const end     = el.selectionEnd
  const selected = editorContent.value.slice(start, end)
  const needsNewline = blockMode && start > 0 && editorContent.value[start - 1] !== '\n'
  const inner   = selected || (suffix ? '文字' : '')
  const insert  = (needsNewline ? '\n' : '') + prefix + inner + suffix
  editorContent.value = editorContent.value.slice(0, start) + insert + editorContent.value.slice(end)
  nextTick(() => {
    const offset = (needsNewline ? 1 : 0) + prefix.length
    const pos = start + offset + inner.length
    el.focus()
    el.setSelectionRange(pos, pos)
  })
}

// ── Editor Helpers ────────────────────────────────────────────────────────
const openEditor = (note?: NoteMeta) => {
  if (note) {
    editingId.value = note.id
    editorTitle.value = note.title
    editorTags.value = note.tags?.join(', ') || ''
    fetch(`/api/notes/${note.id}`).then(r => r.json()).then(d => {
      editorContent.value = d.content || ''
    })
  } else {
    resetEditor()
  }
  editorError.value = ''
  view.value = 'editor'
}

const resetEditor = () => {
  editingId.value      = null
  editorTitle.value    = ''
  editorContent.value  = ''
  editorTags.value     = ''
}

// ── Markdown Rendering ────────────────────────────────────────────────────
const renderMarkdown = (content: string): string => {
  if (!content) return ''
  const withLinks = content.replace(/\[\[([^\]]+)\]\]/g, (_, title) =>
    `<span class="wikilink" data-title="${title.replace(/"/g, '&quot;')}">${title}</span>`
  )
  return marked.parse(withLinks) as string
}

// ── Wikilink Navigation ───────────────────────────────────────────────────
const handleContentClick = async (e: MouseEvent) => {
  const target = e.target as HTMLElement
  if (!target.classList.contains('wikilink')) return
  const title = target.dataset.title
  if (!title) return
  const match = notes.value.find(n => n.title === title || n.title.includes(title))
  if (match) await openNote(match.id)
}

// ── Keyboard Shortcuts ────────────────────────────────────────────────────
const handleGlobalKeydown = (e: KeyboardEvent) => {
  const meta = e.metaKey || e.ctrlKey
  if (meta && e.key === 'k') {
    e.preventDefault()
    searchInputRef.value?.focus()
    return
  }
  if (meta && e.key === 's' && view.value === 'editor') {
    e.preventDefault()
    saveNote()
    return
  }
  if (e.key === 'Escape') {
    if (view.value === 'editor') { view.value = 'list'; resetEditor() }
    else if (view.value === 'viewer') { view.value = 'list' }
  }
}

// ── Lifecycle ──────────────────────────────────────────────────────────────
onMounted(() => {
  fetchNotes()
  window.addEventListener('keydown', handleGlobalKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
  if (compileProgressTimer) clearInterval(compileProgressTimer)
})
</script>

<template>
  <div class="app" :class="{ 'editor-mode': view === 'editor' }">

    <!-- ── Sidebar ── -->
    <aside class="sidebar">
      <div class="sidebar-top">
        <div class="brand">
          <svg viewBox="0 0 32 32" fill="none" width="28" height="28">
            <rect width="32" height="32" rx="8" fill="#1A1F2E"/>
            <circle cx="16" cy="11" r="3" fill="#6366F1" opacity="0.9"/>
            <circle cx="8.5" cy="22" r="2.2" fill="#818CF8" opacity="0.7"/>
            <circle cx="23.5" cy="22" r="2.2" fill="#818CF8" opacity="0.7"/>
            <line x1="16" y1="11" x2="8.5" y2="22" stroke="#6366F1" stroke-width="1" opacity="0.5"/>
            <line x1="16" y1="11" x2="23.5" y2="22" stroke="#6366F1" stroke-width="1" opacity="0.5"/>
            <line x1="8.5" y1="22" x2="23.5" y2="22" stroke="#818CF8" stroke-width="0.8" opacity="0.35"/>
          </svg>
          <span class="brand-name">Vki</span>
        </div>
        <button class="btn-new" @click="openEditor()">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
            <line x1="8" y1="2" x2="8" y2="14"/><line x1="2" y1="8" x2="14" y2="8"/>
          </svg>
          新建笔记
        </button>
      </div>

      <!-- Search -->
      <div class="search-bar">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" width="14" height="14" style="color:var(--text-3);flex-shrink:0">
          <circle cx="6.5" cy="6.5" r="4.5"/><line x1="10" y1="10" x2="14" y2="14"/>
        </svg>
        <input
          ref="searchInputRef"
          v-model="searchQuery"
          type="text"
          class="search-input"
          placeholder="搜索笔记… ⌘K"
        />
        <button v-if="searchQuery" class="search-clear" @click="searchQuery = ''">×</button>
      </div>

      <!-- Nav -->
      <nav class="nav">
        <button
          v-for="type in (['all', 'raw', 'entity', 'concept', 'summary', 'synthesis', 'comparison', 'qa'] as const)"
          :key="type"
          class="nav-item" :class="{ active: selectedType === type && !activeTag }"
          @click="selectedType = type; view = 'list'; activeTag = null; searchQuery = ''"
        >
          <span class="nav-icon" :style="type !== 'all' ? { color: TYPE_COLORS[type as NoteType] } : {}">
            {{ TYPE_ICONS[type] }}
          </span>
          <span class="nav-label">{{ TYPE_LABELS[type] }}</span>
          <span v-if="type !== 'all' && typeCounts[type]" class="nav-count">{{ typeCounts[type] }}</span>
        </button>
      </nav>

      <!-- Tag Cloud -->
      <div v-if="topTags.length" class="tag-cloud">
        <p class="tag-cloud-label">标签</p>
        <div class="tag-cloud-chips">
          <button
            v-for="{ tag, count } in topTags" :key="tag"
            class="tag-chip" :class="{ active: activeTag === tag }"
            @click="activeTag = activeTag === tag ? null : tag; view = 'list'"
          >
            {{ tag }}<span class="tag-chip-count">{{ count }}</span>
          </button>
        </div>
      </div>

      <div class="sidebar-foot">
        <button class="btn-settings" @click="emit('settings')">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" width="15" height="15">
            <circle cx="10" cy="10" r="2.5"/>
            <path d="M10 3v1.5M10 15.5V17M3 10h1.5M15.5 10H17M5.05 5.05l1.06 1.06M13.89 13.89l1.06 1.06M5.05 14.95l1.06-1.06M13.89 6.11l1.06-1.06"/>
          </svg>
          API 设置
        </button>
      </div>
    </aside>

    <!-- ── Main ── -->
    <main class="main">

      <!-- LIST VIEW -->
      <template v-if="view === 'list'">
        <div class="list-header">
          <h2 class="list-title">
            <template v-if="activeTag">#{{ activeTag }}</template>
            <template v-else>{{ TYPE_LABELS[selectedType] }}</template>
          </h2>
          <span class="list-count">{{ filteredNotes.length }} 条</span>
          <template v-if="searchQuery">
            <span class="filter-chip">
              "{{ searchQuery }}"
              <button @click="searchQuery = ''">×</button>
            </span>
          </template>
        </div>

        <div v-if="isLoading" class="empty">
          <div class="spinner" />
          <p>加载中...</p>
        </div>

        <div v-else-if="!filteredNotes.length" class="empty">
          <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.2" width="44" height="44" opacity="0.25">
            <rect x="8" y="10" width="32" height="28" rx="3"/>
            <line x1="14" y1="18" x2="34" y2="18"/>
            <line x1="14" y1="24" x2="28" y2="24"/>
            <line x1="14" y1="30" x2="22" y2="30"/>
          </svg>
          <p>暂无笔记</p>
          <small v-if="searchQuery || activeTag">没有匹配的笔记</small>
          <small v-else-if="selectedType === 'raw' || selectedType === 'all'">点击「新建笔记」开始记录</small>
          <small v-else>编译原始笔记后将在这里生成</small>
        </div>

        <div v-else class="cards">
          <div
            v-for="note in filteredNotes" :key="note.id"
            class="card" @click="openNote(note.id)"
          >
            <div class="card-top">
              <span class="card-type-badge" :style="{ color: TYPE_COLORS[note.type], borderColor: TYPE_COLORS[note.type] + '30', background: TYPE_COLORS[note.type] + '10' }">
                {{ TYPE_ICONS[note.type] }} {{ TYPE_LABELS[note.type] }}
              </span>
              <span class="card-date">{{ new Date(note.updated).toLocaleDateString('zh-CN') }}</span>
            </div>
            <h3 class="card-title">{{ note.title }}</h3>
            <p v-if="note.preview" class="card-preview">{{ note.preview }}</p>
            <div v-if="note.tags?.length" class="card-tags">
              <span v-for="tag in note.tags.slice(0, 3)" :key="tag" class="tag">{{ tag }}</span>
            </div>
            <div v-if="note.links?.length" class="card-links">
              <span class="links-label">链接</span>
              <span v-for="lnk in note.links.slice(0, 3)" :key="lnk" class="link-chip">{{ lnk }}</span>
            </div>
          </div>
        </div>
      </template>

      <!-- EDITOR VIEW -->
      <template v-else-if="view === 'editor'">
        <div class="editor-header">
          <button class="btn-back" @click="view = 'list'; resetEditor()">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
              <polyline points="10,3 4,8 10,13"/>
            </svg>
            返回
          </button>
          <h2 class="editor-heading">{{ editingId ? '编辑笔记' : '新建原始笔记' }}</h2>
          <span class="editor-shortcut-hint">⌘S 保存 · Esc 返回</span>
        </div>

        <!-- Editor body (left column) -->
        <div class="editor-body">
          <div class="field">
            <label>标题</label>
            <input v-model="editorTitle" type="text" placeholder="给这条笔记起个名字..." />
          </div>
          <div class="field">
            <label>标签 <em>（逗号或空格分隔）</em></label>
            <input v-model="editorTags" type="text" placeholder="AI, 产品, 思考..." />
          </div>
          <div class="field field-grow">
            <label>内容</label>
            <!-- Markdown Toolbar -->
            <div class="md-toolbar">
              <button class="tb-btn" title="一级标题" @click="insertMarkdown('# ', '', true)">H1</button>
              <button class="tb-btn" title="二级标题" @click="insertMarkdown('## ', '', true)">H2</button>
              <span class="tb-divider"/>
              <button class="tb-btn tb-bold" title="粗体 (选中文字后点击)" @click="insertMarkdown('**', '**')"><strong>B</strong></button>
              <button class="tb-btn tb-italic" title="斜体" @click="insertMarkdown('*', '*')"><em>I</em></button>
              <button class="tb-btn" title="行内代码" @click="insertMarkdown('`', '`')"><code>{ }</code></button>
              <button class="tb-btn" title="引用块" @click="insertMarkdown('> ', '', true)">❝</button>
              <span class="tb-divider"/>
              <button class="tb-btn" title="超链接" @click="insertMarkdown('[', '](url)')">🔗</button>
              <button class="tb-btn" title="无序列表" @click="insertMarkdown('- ', '', true)">• —</button>
              <button class="tb-btn" title="有序列表" @click="insertMarkdown('1. ', '', true)">1.</button>
              <button class="tb-btn" title="分隔线" @click="insertMarkdown('\n---\n', '', false)">—</button>
            </div>
            <textarea
              ref="contentRef"
              v-model="editorContent"
              placeholder="写下你的笔记、灵感、摘抄...&#10;&#10;支持 Markdown 格式，[[标题]] 创建内部链接。保存后可以点击「编译为 Wiki」让 AI 自动生成结构化知识页面。"
              @keydown.meta.enter="saveNote"
            />
            <div class="editor-footer-bar">
              <span class="word-count">{{ wordCount.words }} 词 · {{ wordCount.chars }} 字符</span>
            </div>
          </div>
          <p v-if="editorError" class="field-error">{{ editorError }}</p>
          <div class="editor-actions">
            <button class="btn-ghost" @click="view = 'list'; resetEditor()">取消</button>
            <button class="btn-save" @click="saveNote">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                <path d="M13 3L6 10l-3-3"/>
              </svg>
              保存笔记
            </button>
          </div>
        </div>

        <!-- Preview pane (right column, always visible in editor mode) -->
        <div class="editor-preview-pane">
          <div class="preview-pane-header">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" width="13" height="13" style="opacity:0.5">
              <path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="2"/>
            </svg>
            实时预览
          </div>
          <div
            v-if="renderedPreview"
            class="md-body preview-content"
            v-html="renderedPreview"
          />
          <div v-else class="preview-empty">
            <span>开始输入，这里会显示预览...</span>
          </div>
        </div>
      </template>

      <!-- VIEWER VIEW -->
      <template v-else-if="view === 'viewer' && currentNote">
        <div class="viewer-header">
          <button class="btn-back" @click="view = 'list'">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
              <polyline points="10,3 4,8 10,13"/>
            </svg>
            返回
          </button>

          <div class="viewer-meta">
            <span class="type-badge" :style="{ color: TYPE_COLORS[currentNote.type], borderColor: TYPE_COLORS[currentNote.type] + '30', background: TYPE_COLORS[currentNote.type] + '10' }">
              {{ TYPE_ICONS[currentNote.type] }} {{ TYPE_LABELS[currentNote.type] }}
            </span>
            <span class="viewer-date">{{ new Date(currentNote.updated).toLocaleString('zh-CN') }}</span>
          </div>

          <div class="viewer-actions">
            <!-- Copy button -->
            <button class="btn-ghost-sm" :class="{ copied: copiedNote }" @click="copyNoteContent">
              <svg v-if="!copiedNote" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" width="13" height="13">
                <rect x="5" y="5" width="9" height="9" rx="1.5"/><path d="M11 5V3a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h2"/>
              </svg>
              <svg v-else viewBox="0 0 16 16" fill="none" stroke="#34D399" stroke-width="2" width="13" height="13">
                <polyline points="2,8 6,12 14,4"/>
              </svg>
              {{ copiedNote ? '已复制' : '复制' }}
            </button>
            <button v-if="currentNote.type === 'raw'" class="btn-ghost-sm" @click="openEditor(currentNote)">编辑</button>
            <button class="btn-delete" @click="deleteNote(currentNote.id)">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" width="14" height="14">
                <polyline points="2,4 14,4"/><path d="M5 4V2h6v2"/><path d="M6 7v5M10 7v5"/><rect x="3" y="4" width="10" height="10" rx="1"/>
              </svg>
            </button>
          </div>
        </div>

        <div class="viewer-body">
          <h1 class="viewer-title">{{ currentNote.title }}</h1>

          <!-- Tags -->
          <div v-if="currentNote.tags?.length" class="viewer-tags">
            <span v-for="tag in currentNote.tags" :key="tag" class="tag">{{ tag }}</span>
          </div>

          <!-- Compile section (raw notes only) -->
          <div v-if="currentNote.type === 'raw'" class="compile-section">
            <!-- Compiled result -->
            <div v-if="compiledPages.length" class="compile-result">
              <span class="compile-ok">
                <svg viewBox="0 0 16 16" fill="none" stroke="#34D399" stroke-width="2" width="14" height="14">
                  <polyline points="2,8 6,12 14,4"/>
                </svg>
                已生成 {{ compiledPages.length }} 个 Wiki 页面
              </span>
              <div class="compiled-chips">
                <button
                  v-for="page in compiledPages" :key="page.id"
                  class="compiled-chip"
                  :style="{ color: TYPE_COLORS[page.type as NoteType], borderColor: TYPE_COLORS[page.type as NoteType] + '30' }"
                  @click="openNote(page.id)"
                >
                  {{ TYPE_ICONS[page.type as NoteType] }} {{ page.title }}
                </button>
              </div>
            </div>

            <!-- Already compiled indicator -->
            <div v-else-if="currentNote.compiledAt && !isCompiling" class="compile-hint">
              <svg viewBox="0 0 16 16" fill="none" stroke="#818CF8" stroke-width="1.6" width="13" height="13">
                <polyline points="2,8 6,12 14,4"/>
              </svg>
              上次编译：{{ new Date(currentNote.compiledAt).toLocaleString('zh-CN') }}
              <button class="btn-recompile" @click="compileNote">重新编译</button>
            </div>

            <!-- Compile button -->
            <button v-else-if="!isCompiling" class="btn-compile" @click="compileNote">
              <svg viewBox="0 0 16 16" fill="currentColor" width="14" height="14">
                <path d="M8 1l1.5 4L14 7l-4.5 1.5L8 13l-1.5-4.5L2 7l4.5-1.5z"/>
              </svg>
              编译为 Wiki
            </button>

            <!-- Compiling state with progress bar -->
            <div v-if="isCompiling" class="compiling">
              <div class="compiling-top">
                <div class="compile-spinner" />
                <span class="compile-msg">{{ COMPILE_MSGS[compileMsgIdx] }}</span>
                <span class="compile-pct">{{ Math.floor(compileProgress) }}%</span>
              </div>
              <div class="compile-progress-track">
                <div class="compile-progress-fill" :style="{ width: compileProgress + '%' }" />
              </div>
            </div>
          </div>

          <!-- Source link (for compiled pages) -->
          <div v-if="currentNote.sourceId" class="source-link">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" width="13" height="13">
              <path d="M7 3H3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V9"/><path d="M10 1h5v5"/><line x1="14" y1="2" x2="7" y2="9"/>
            </svg>
            来源：
            <button class="source-btn" @click="openNote(currentNote.sourceId!)">
              {{ notes.find(n => n.id === currentNote!.sourceId)?.title || '原始笔记' }}
            </button>
          </div>

          <!-- Markdown content -->
          <div
            class="md-body"
            v-html="renderMarkdown(currentNote.content)"
            @click="handleContentClick"
          />

          <!-- Linked pages -->
          <div v-if="currentNote.links?.length" class="viewer-links">
            <p class="links-heading">关联页面</p>
            <div class="links-list">
              <button
                v-for="title in currentNote.links" :key="title"
                class="link-btn"
                @click="handleContentClick({ target: { classList: { contains: (c: string) => c === 'wikilink' }, dataset: { title } } } as unknown as MouseEvent)"
              >
                {{ title }}
              </button>
            </div>
          </div>
        </div>
      </template>

    </main>
  </div>

  <!-- Toast Notifications -->
  <Teleport to="body">
    <div class="toast-stack">
      <TransitionGroup name="toast">
        <div v-for="toast in toasts" :key="toast.id" class="toast" :class="toast.type">
          <svg v-if="toast.type === 'success'" viewBox="0 0 16 16" fill="none" stroke="#34D399" stroke-width="2" width="14" height="14">
            <polyline points="2,8 6,12 14,4"/>
          </svg>
          <svg v-else-if="toast.type === 'error'" viewBox="0 0 16 16" fill="none" stroke="#F87171" stroke-width="2" width="14" height="14">
            <circle cx="8" cy="8" r="6"/><path d="M8 5v4M8 11v0.5"/>
          </svg>
          <svg v-else viewBox="0 0 16 16" fill="none" stroke="#60A5FA" stroke-width="2" width="14" height="14">
            <circle cx="8" cy="8" r="6"/><path d="M8 7v5M8 5v0.5"/>
          </svg>
          {{ toast.message }}
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
/* ── Layout ── */
.app {
  display: flex;
  height: 100vh;
  overflow: hidden;
  background: var(--bg);
}

/* ── Sidebar ── */
.sidebar {
  width: 220px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border);
  background: var(--bg-card);
  overflow: hidden;
}

.sidebar-top {
  padding: 18px 14px 12px;
  border-bottom: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 9px;
}

.brand-name {
  font-size: 18px;
  font-weight: 700;
  color: var(--text);
  letter-spacing: -0.3px;
}

.btn-new {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 8px 12px;
  background: rgba(99, 102, 241, 0.12);
  border: 1px solid rgba(99, 102, 241, 0.25);
  border-radius: 8px;
  color: var(--accent-lt);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-new:hover { background: rgba(99, 102, 241, 0.2); }

/* Search */
.search-bar {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  background: rgba(0,0,0,0.15);
}

.search-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text);
  font-size: 12px;
  font-family: inherit;
}
.search-input::placeholder { color: var(--text-3); }

.search-clear {
  background: none;
  border: none;
  color: var(--text-3);
  cursor: pointer;
  font-size: 15px;
  line-height: 1;
  padding: 0 2px;
  transition: color 0.15s;
}
.search-clear:hover { color: var(--text-2); }

.nav {
  flex: 1;
  overflow-y: auto;
  padding: 10px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 10px;
  background: transparent;
  border: none;
  border-radius: 7px;
  color: var(--text-2);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
  text-align: left;
}
.nav-item:hover { background: rgba(255,255,255,0.04); color: var(--text); }
.nav-item.active { background: rgba(99, 102, 241, 0.1); color: var(--text); }

.nav-icon { font-size: 13px; width: 16px; text-align: center; flex-shrink: 0; }
.nav-label { flex: 1; }
.nav-count {
  font-size: 11px;
  color: var(--text-3);
  background: rgba(255,255,255,0.06);
  padding: 1px 6px;
  border-radius: 99px;
}

/* Tag Cloud */
.tag-cloud {
  padding: 10px 12px 12px;
  border-top: 1px solid var(--border);
}

.tag-cloud-label {
  font-size: 10px;
  color: var(--text-3);
  text-transform: uppercase;
  letter-spacing: 0.7px;
  margin-bottom: 7px;
}

.tag-cloud-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 3px 8px;
  background: rgba(255,255,255,0.04);
  border: 1px solid var(--border);
  border-radius: 99px;
  font-size: 11px;
  color: var(--text-3);
  cursor: pointer;
  transition: all 0.15s;
  font-family: inherit;
}
.tag-chip:hover { color: var(--text-2); border-color: rgba(99,102,241,0.25); }
.tag-chip.active {
  color: var(--accent-lt);
  border-color: rgba(99,102,241,0.35);
  background: rgba(99,102,241,0.1);
}

.tag-chip-count {
  font-size: 10px;
  opacity: 0.55;
  margin-left: 1px;
}

.sidebar-foot {
  padding: 12px 8px;
  border-top: 1px solid var(--border);
}

.btn-settings {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  padding: 7px 10px;
  background: transparent;
  border: none;
  border-radius: 7px;
  color: var(--text-3);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}
.btn-settings:hover { color: var(--text-2); background: rgba(255,255,255,0.04); }

/* ── Main ── */
.main {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

/* ── Editor Mode: Three-zone Layout ── */
.app.editor-mode {
  overflow: hidden;
}

.app.editor-mode .main {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: auto 1fr;
  overflow: hidden;
}

.app.editor-mode .editor-header {
  grid-column: 1 / -1;
  grid-row: 1;
}

.app.editor-mode .editor-body {
  grid-column: 1;
  grid-row: 2;
  overflow-y: auto;
  padding-bottom: 32px;
}

.editor-preview-pane {
  display: none;
}

.app.editor-mode .editor-preview-pane {
  display: flex;
  flex-direction: column;
  grid-column: 2;
  grid-row: 2;
  overflow-y: auto;
  border-left: 1px solid var(--border);
  background: var(--bg-card);
}

.preview-pane-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 14px 20px 10px;
  font-size: 11px;
  color: var(--text-3);
  text-transform: uppercase;
  letter-spacing: 0.6px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.preview-content {
  padding: 20px 24px 40px;
  flex: 1;
}

.preview-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: var(--text-3);
}

/* ── List ── */
.list-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 24px 28px 16px;
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
}

.list-title { font-size: 18px; font-weight: 700; color: var(--text); }
.list-count { font-size: 13px; color: var(--text-3); }

.filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  padding: 2px 8px;
  background: rgba(99,102,241,0.1);
  border: 1px solid rgba(99,102,241,0.25);
  border-radius: 99px;
  color: var(--accent-lt);
}
.filter-chip button {
  background: none;
  border: none;
  color: var(--accent-lt);
  cursor: pointer;
  font-size: 13px;
  line-height: 1;
  padding: 0;
  opacity: 0.7;
}
.filter-chip button:hover { opacity: 1; }

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 80px 24px;
  color: var(--text-2);
  font-size: 14px;
}
.empty small { font-size: 12px; color: var(--text-3); }

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
  padding: 20px 28px 40px;
}

.card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
  cursor: pointer;
  transition: border-color 0.2s, transform 0.15s;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.card:hover { border-color: rgba(99,102,241,0.35); transform: translateY(-1px); }

.card-top { display: flex; align-items: center; justify-content: space-between; }
.card-type-badge {
  font-size: 11px;
  padding: 2px 8px;
  border: 1px solid;
  border-radius: 99px;
  font-weight: 500;
}
.card-date { font-size: 11px; color: var(--text-3); }
.card-title { font-size: 14px; font-weight: 600; color: var(--text); line-height: 1.45; }

.card-preview {
  font-size: 12px;
  color: var(--text-3);
  line-height: 1.55;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  margin: 0;
}

.card-tags, .card-links { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
.tag {
  font-size: 11px;
  padding: 2px 7px;
  background: rgba(255,255,255,0.05);
  border-radius: 99px;
  color: var(--text-3);
}

.links-label { font-size: 11px; color: var(--text-3); }
.link-chip {
  font-size: 11px;
  padding: 2px 7px;
  background: rgba(99,102,241,0.08);
  border-radius: 99px;
  color: var(--accent-lt);
}

/* ── Editor ── */
.editor-header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 24px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-card);
}

.editor-heading { font-size: 16px; font-weight: 600; color: var(--text); }

.editor-shortcut-hint {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-3);
}

.editor-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px 24px 32px;
}

.field { display: flex; flex-direction: column; gap: 6px; }
.field-grow { flex: 1; display: flex; flex-direction: column; }
.field label {
  font-size: 12px;
  color: var(--text-2);
  text-transform: uppercase;
  letter-spacing: 0.4px;
}
.field label em { text-transform: none; font-style: normal; color: var(--text-3); font-size: 11px; }

.field input, .field textarea {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 9px;
  padding: 11px 14px;
  color: var(--text);
  font-size: 14px;
  outline: none;
  font-family: inherit;
  transition: border-color 0.2s;
}
.field input:focus, .field textarea:focus { border-color: var(--accent); }
.field input::placeholder, .field textarea::placeholder { color: var(--text-3); }
.field textarea {
  resize: none;
  flex: 1;
  min-height: 240px;
  line-height: 1.7;
  border-radius: 0 0 9px 9px;
  border-top: none;
}

/* Markdown Toolbar */
.md-toolbar {
  display: flex;
  align-items: center;
  gap: 1px;
  padding: 6px 8px;
  background: var(--bg-card2);
  border: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  border-radius: 9px 9px 0 0;
  flex-wrap: wrap;
}

.tb-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 26px;
  padding: 0 6px;
  background: transparent;
  border: none;
  border-radius: 5px;
  color: var(--text-2);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: color 0.15s, background 0.15s;
  white-space: nowrap;
}
.tb-btn:hover { color: var(--text); background: rgba(255,255,255,0.07); }
.tb-btn code { font-family: monospace; font-size: 11px; }

.tb-divider {
  width: 1px;
  height: 16px;
  background: var(--border);
  margin: 0 4px;
  flex-shrink: 0;
}

.editor-footer-bar {
  display: flex;
  justify-content: flex-end;
  padding: 5px 2px 0;
}

.word-count {
  font-size: 11px;
  color: var(--text-3);
}

.field-error { font-size: 13px; color: #F87171; }

.editor-actions { display: flex; gap: 10px; justify-content: flex-end; }

.btn-back {
  display: flex;
  align-items: center;
  gap: 5px;
  background: transparent;
  border: none;
  color: var(--text-2);
  font-size: 13px;
  cursor: pointer;
  padding: 5px 8px;
  border-radius: 6px;
  transition: color 0.2s, background 0.2s;
}
.btn-back:hover { color: var(--text); background: rgba(255,255,255,0.04); }

.btn-ghost {
  padding: 9px 18px;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-2);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-ghost:hover { border-color: rgba(99,102,241,0.35); color: var(--text); }

.btn-save {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 9px 20px;
  background: linear-gradient(135deg, var(--accent), var(--accent-dk));
  border: none;
  border-radius: 8px;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
  box-shadow: 0 3px 12px rgba(99,102,241,0.28);
}
.btn-save:hover { opacity: 0.88; }

/* ── Viewer ── */
.viewer-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 28px;
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
}

.viewer-meta { display: flex; align-items: center; gap: 10px; flex: 1; }
.type-badge {
  font-size: 11px;
  padding: 3px 9px;
  border: 1px solid;
  border-radius: 99px;
  font-weight: 500;
}
.viewer-date { font-size: 12px; color: var(--text-3); }
.viewer-actions { display: flex; align-items: center; gap: 8px; }

.btn-ghost-sm {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 7px;
  color: var(--text-2);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
  font-family: inherit;
}
.btn-ghost-sm:hover { border-color: rgba(99,102,241,0.35); color: var(--text); }
.btn-ghost-sm.copied { border-color: rgba(52,211,153,0.35); color: #34D399; }

.btn-delete {
  display: flex;
  align-items: center;
  padding: 6px;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 7px;
  color: var(--text-3);
  cursor: pointer;
  transition: all 0.2s;
}
.btn-delete:hover { color: #F87171; border-color: rgba(248,113,113,0.3); }

.viewer-body {
  padding: 28px 40px 60px;
  max-width: 800px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.viewer-title { font-size: 26px; font-weight: 700; color: var(--text); line-height: 1.3; }

.viewer-tags { display: flex; flex-wrap: wrap; gap: 5px; }

/* Compile section */
.compile-section { display: flex; flex-direction: column; gap: 10px; }

.btn-compile {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 10px 20px;
  background: linear-gradient(135deg, var(--accent), var(--accent-dk));
  border: none;
  border-radius: 9px;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
  box-shadow: 0 3px 12px rgba(99,102,241,0.3);
  width: fit-content;
  font-family: inherit;
}
.btn-compile:hover { opacity: 0.88; }

.compiling {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 16px;
  background: rgba(99,102,241,0.06);
  border: 1px solid rgba(99,102,241,0.15);
  border-radius: 9px;
}

.compiling-top {
  display: flex;
  align-items: center;
  gap: 10px;
}

.compile-spinner {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid rgba(99,102,241,0.2);
  border-top-color: var(--accent);
  animation: spin 1s linear infinite;
  flex-shrink: 0;
}

.compile-msg { font-size: 13px; color: var(--accent-lt); flex: 1; }

.compile-pct {
  font-size: 11px;
  color: var(--accent-lt);
  font-variant-numeric: tabular-nums;
  width: 32px;
  text-align: right;
}

.compile-progress-track {
  height: 3px;
  background: rgba(99,102,241,0.15);
  border-radius: 99px;
  overflow: hidden;
}

.compile-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent-dk), var(--accent-lt));
  border-radius: 99px;
  transition: width 0.8s ease;
}

.compile-result { display: flex; flex-direction: column; gap: 10px; }
.compile-ok {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #34D399;
}

.compiled-chips { display: flex; flex-wrap: wrap; gap: 7px; }
.compiled-chip {
  padding: 5px 12px;
  background: transparent;
  border: 1px solid;
  border-radius: 99px;
  font-size: 12px;
  cursor: pointer;
  transition: opacity 0.2s;
  font-family: inherit;
}
.compiled-chip:hover { opacity: 0.8; }

.compile-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-3);
}

.btn-recompile {
  background: transparent;
  border: none;
  color: var(--accent-lt);
  font-size: 12px;
  cursor: pointer;
  padding: 0;
  transition: opacity 0.2s;
  font-family: inherit;
}
.btn-recompile:hover { opacity: 0.8; }

/* Source link */
.source-link {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-3);
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
}

.source-btn {
  background: transparent;
  border: none;
  color: var(--accent-lt);
  font-size: 12px;
  cursor: pointer;
  padding: 0;
  transition: opacity 0.2s;
  font-family: inherit;
}
.source-btn:hover { opacity: 0.8; }

/* ── Markdown body ── */
.md-body {
  line-height: 1.8;
  color: var(--text-2);
  font-size: 15px;
}

.md-body :deep(h1), .md-body :deep(h2), .md-body :deep(h3) {
  color: var(--text);
  margin: 24px 0 10px;
  line-height: 1.3;
}
.md-body :deep(h1) { font-size: 20px; }
.md-body :deep(h2) { font-size: 17px; }
.md-body :deep(h3) { font-size: 15px; }
.md-body :deep(p) { margin-bottom: 12px; }
.md-body :deep(ul), .md-body :deep(ol) { padding-left: 20px; margin-bottom: 12px; }
.md-body :deep(li) { margin-bottom: 4px; }
.md-body :deep(code) {
  background: rgba(99,102,241,0.1);
  color: var(--accent-lt);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 13px;
}
.md-body :deep(pre) {
  background: var(--bg-card2);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 14px 16px;
  overflow-x: auto;
  margin-bottom: 14px;
}
.md-body :deep(pre code) { background: none; padding: 0; }
.md-body :deep(blockquote) {
  border-left: 3px solid var(--accent);
  margin-left: 0;
  padding-left: 14px;
  color: var(--text-3);
  font-style: italic;
}
.md-body :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 14px;
  font-size: 14px;
}
.md-body :deep(th), .md-body :deep(td) {
  border: 1px solid var(--border);
  padding: 8px 12px;
  text-align: left;
}
.md-body :deep(th) {
  background: var(--bg-card2);
  color: var(--text);
  font-weight: 600;
}
.md-body :deep(strong) { color: var(--text); }
.md-body :deep(hr) {
  border: none;
  border-top: 1px solid var(--border);
  margin: 20px 0;
}

.md-body :deep(.wikilink) {
  color: var(--accent-lt);
  background: rgba(99,102,241,0.08);
  padding: 1px 5px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s;
  font-weight: 500;
}
.md-body :deep(.wikilink:hover) { background: rgba(99,102,241,0.18); }

/* Linked pages */
.viewer-links {
  border-top: 1px solid var(--border);
  padding-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.links-heading { font-size: 12px; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.5px; }
.links-list { display: flex; flex-wrap: wrap; gap: 7px; }
.link-btn {
  padding: 5px 12px;
  background: rgba(99,102,241,0.06);
  border: 1px solid rgba(99,102,241,0.2);
  border-radius: 99px;
  color: var(--accent-lt);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
  font-family: inherit;
}
.link-btn:hover { background: rgba(99,102,241,0.14); }

/* ── Spinner ── */
.spinner {
  width: 24px; height: 24px;
  border-radius: 50%;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  animation: spin 1s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

/* ── Toast Notifications ── */
.toast-stack {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}

.toast {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 10px 16px;
  background: var(--bg-card2);
  border: 1px solid var(--border);
  border-radius: 10px;
  font-size: 13px;
  color: var(--text);
  box-shadow: 0 8px 24px rgba(0,0,0,0.5);
  pointer-events: auto;
  min-width: 180px;
  max-width: 300px;
}
.toast.success { border-color: rgba(52,211,153,0.3); }
.toast.error   { border-color: rgba(248,113,113,0.3); color: #FCA5A5; }
.toast.info    { border-color: rgba(96,165,250,0.3); }

.toast-enter-active { transition: all 0.28s cubic-bezier(0.34, 1.56, 0.64, 1); }
.toast-leave-active { transition: all 0.22s ease; }
.toast-enter-from   { opacity: 0; transform: translateX(24px) scale(0.93); }
.toast-leave-to     { opacity: 0; transform: translateX(12px); }
</style>
