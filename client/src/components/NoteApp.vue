<script setup lang="ts">
import { ref, computed, reactive, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { marked } from 'marked'
import { useUser, useClerk } from '@clerk/vue'
import GraphView from './GraphView.vue'

const props = defineProps<{ apiKey: string; baseUrl: string; getToken: () => Promise<string | null> }>()
const emit = defineEmits<{ settings: [] }>()

const { user } = useUser()
const { signOut } = useClerk()

const userDisplayName = computed(() => {
  if (!user.value) return ''
  return user.value.fullName || user.value.primaryEmailAddress?.emailAddress || ''
})

const userInitial = computed(() => {
  const name = user.value?.fullName || user.value?.primaryEmailAddress?.emailAddress || '?'
  return name[0].toUpperCase()
})

// ── Types ──────────────────────────────────────────────────────────────────
type NoteType = 'raw' | 'entity' | 'concept' | 'summary' | 'synthesis' | 'comparison' | 'qa'
type ViewMode = 'list' | 'editor' | 'viewer' | 'graph' | 'review'

interface NoteMeta {
  id: string
  type: NoteType
  title: string
  tags: string[]
  links: string[]
  sourceId?: string
  compiledAt?: string
  reviewInterval?: number
  reviewCount?: number
  reviewedAt?: string
  nextReviewAt?: string
  created: string
  updated: string
  preview?: string
  space?: string
  date?: string
  read?: boolean
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

// ── Mobile Sidebar ────────────────────────────────────────────────────────
const showMobileSidebar = ref(false)
watch([view, selectedType, activeTag], () => { showMobileSidebar.value = false })

// ── Knowledge Spaces ──────────────────────────────────────────────────────
const currentSpace   = ref(localStorage.getItem('vki_current_space') || '默认')
const spaces         = ref<{ name: string; count: number }[]>([])
const newSpaceName   = ref('')
const showNewSpace   = ref(false)
const newSpaceInputRef = ref<HTMLInputElement | null>(null)
const renamingSpace  = ref<string | null>(null)
const renameValue    = ref('')
const renameInputRef = ref<HTMLInputElement | null>(null)

const allSpaces = computed(() => spaces.value)

// ── Copy State ────────────────────────────────────────────────────────────
const copiedNote = ref(false)

// ── PPT State ─────────────────────────────────────────────────────────────
const isGeneratingPPT = ref(false)

// ── Review State ──────────────────────────────────────────────────────────
const reviewQueue      = ref<NoteMeta[]>([])
const reviewIdx        = ref(0)
const reviewNote       = ref<NoteDetail | null>(null)
const reviewLoading    = ref(false)
const reviewDone       = ref(false)

const reviewDueCount   = computed(() => reviewQueue.value.length)

// ── Push Notification State ───────────────────────────────────────────────
const pushSupported    = ref('serviceWorker' in navigator && 'PushManager' in window)
const pushSubscribed   = ref(false)
const pushLoading      = ref(false)

// ── Chat State ────────────────────────────────────────────────────────────
const chatOpen      = ref(false)
const chatMessages  = ref<{ role: 'user' | 'assistant'; content: string }[]>([])
const chatInput     = ref('')
const isChatting    = ref(false)
const chatStreaming  = ref('')
const chatScrollRef = ref<HTMLDivElement | null>(null)

// ── Graph Compile (from graph view) ──────────────────────────────────────
const compilingIds = reactive(new Set<string>())

const compileFromGraph = async (id: string) => {
  if (compilingIds.has(id)) return
  compilingIds.add(id)
  try {
    const res = await authFetch(`/api/compile/${id}`, { method: 'POST', headers: headers() })
    const data = await res.json()
    if (data.pages) {
      await fetchNotes()
      showToast(`✦ 已生成 ${data.pages.length} 个延伸神经元`)
    } else {
      showToast(data.error || '生成失败', 'error')
    }
  } catch {
    showToast('网络错误', 'error')
  } finally {
    compilingIds.delete(id)
  }
}

// ── Delete Confirmation ───────────────────────────────────────────────────
const confirmDeleteId = ref<string | null>(null)
let confirmDeleteTimer: ReturnType<typeof setTimeout> | null = null

const startDelete = (id: string) => {
  confirmDeleteId.value = id
  if (confirmDeleteTimer) clearTimeout(confirmDeleteTimer)
  confirmDeleteTimer = setTimeout(() => { confirmDeleteId.value = null }, 4000)
}

const cancelDelete = () => {
  confirmDeleteId.value = null
  if (confirmDeleteTimer) clearTimeout(confirmDeleteTimer)
}

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

const noteGroups = computed(() => {
  const notes = filteredNotes.value
  const dated = notes.filter(n => n.date)
  if (dated.length < 2) return null
  const map = new Map<string, NoteMeta[]>()
  for (const n of notes) {
    const key = n.date || ''
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(n)
  }
  return Array.from(map.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, items]) => ({ date, items }))
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

const backlinks = computed(() => {
  if (!currentNote.value) return []
  const title = currentNote.value.title
  return notes.value.filter(n => n.id !== currentNote.value!.id && n.links?.includes(title))
})

const outgoingLinks = computed(() => {
  if (!currentNote.value) return []
  return (currentNote.value.links || [])
    .map(title => notes.value.find(n => n.title === title))
    .filter(Boolean) as NoteMeta[]
})

// ── API Helpers ────────────────────────────────────────────────────────────
const authFetch = async (url: string, options: RequestInit = {}) => {
  const token = await props.getToken()
  return fetch(url, {
    ...options,
    headers: {
      ...(options.headers as Record<string, string> || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
}

const headers = () => ({
  'Content-Type': 'application/json',
  'x-api-key':  props.apiKey,
  'x-base-url': props.baseUrl,
})

const fetchNotes = async () => {
  isLoading.value = true
  try {
    const res = await authFetch(`/api/notes?space=${encodeURIComponent(currentSpace.value)}`)
    notes.value = await res.json()
  } finally {
    isLoading.value = false
  }
}

const fetchSpaces = async () => {
  const res = await authFetch('/api/spaces')
  spaces.value = await res.json()
  // If the stored space no longer exists, fall back to the first available one
  if (spaces.value.length && !spaces.value.find(s => s.name === currentSpace.value)) {
    currentSpace.value = spaces.value[0].name
    localStorage.setItem('vki_current_space', currentSpace.value)
    await fetchNotes()
  }
}

const openNote = async (id: string) => {
  const res = await authFetch(`/api/notes/${id}`)
  currentNote.value = await res.json()
  // Clear unread badge in the local list immediately
  const idx = notes.value.findIndex(n => n.id === id)
  if (idx !== -1 && notes.value[idx].read === false) {
    notes.value[idx] = { ...notes.value[idx], read: true }
  }
  compiledPages.value = []
  compileProgress.value = 0
  chatOpen.value = false
  chatMessages.value = []
  chatStreaming.value = ''
  view.value = 'viewer'
}

const saveNote = async () => {
  if (!editorTitle.value.trim()) { editorError.value = '请输入标题'; return }
  editorError.value = ''
  const tags = editorTags.value.split(/[,，\s]+/).map(t => t.trim()).filter(Boolean)
  const wasEditing = editingId.value
  try {
    if (editingId.value) {
      await authFetch(`/api/notes/${editingId.value}`, {
        method: 'PUT',
        headers: headers(),
        body: JSON.stringify({ title: editorTitle.value, content: editorContent.value, tags }),
      })
    } else {
      await authFetch('/api/notes', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ title: editorTitle.value, content: editorContent.value, tags, space: currentSpace.value }),
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
    await authFetch(`/api/notes/${id}`, { method: 'DELETE' })
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
    const res = await authFetch(`/api/compile/${currentNote.value.id}`, {
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
      const updated = await authFetch(`/api/notes/${currentNote.value.id}`)
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

// ── Space Management ─────────────────────────────────────────────────────
const switchSpace = async (name: string) => {
  if (currentSpace.value === name) return
  currentSpace.value = name
  localStorage.setItem('vki_current_space', name)
  selectedType.value = 'all'
  activeTag.value = null
  searchQuery.value = ''
  view.value = 'list'
  await fetchNotes()
}

const createSpace = async () => {
  const name = newSpaceName.value.trim()
  if (!name) return
  showNewSpace.value = false
  newSpaceName.value = ''
  try {
    await authFetch('/api/spaces', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ name }),
    })
    await fetchSpaces()
    await switchSpace(name)
  } catch {
    showToast('创建空间失败', 'error')
  }
}

const startRename = (name: string) => {
  renamingSpace.value = name
  renameValue.value = name
  nextTick(() => { renameInputRef.value?.select() })
}

const commitRename = async () => {
  const oldName = renamingSpace.value
  const newName = renameValue.value.trim()
  renamingSpace.value = null
  if (!newName || newName === oldName || !oldName) return
  try {
    await authFetch('/api/spaces/rename', {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ oldName, newName }),
    })
    if (currentSpace.value === oldName) {
      currentSpace.value = newName
      localStorage.setItem('vki_current_space', newName)
    }
    await fetchSpaces()
    showToast('空间已重命名')
  } catch {
    showToast('重命名失败', 'error')
  }
}

// ── PPT Generation ────────────────────────────────────────────────────────
const generatePPT = async () => {
  if (!currentNote.value || isGeneratingPPT.value) return
  isGeneratingPPT.value = true
  showToast('正在生成 PPT，请稍候...', 'info')
  try {
    const token = await props.getToken()
    const resp = await fetch(`/api/ppt/${currentNote.value.id}`, {
      method: 'POST',
      headers: {
        ...headers(),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })
    if (!resp.ok) {
      const err = await resp.json()
      showToast(err.error || '生成失败', 'error')
      return
    }
    const blob = await resp.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${currentNote.value.title.slice(0, 40)}.pptx`
    a.click()
    URL.revokeObjectURL(url)
    showToast('PPT 已生成并下载')
  } catch {
    showToast('生成失败，请重试', 'error')
  } finally {
    isGeneratingPPT.value = false
  }
}

// ── Enroll / Review ────────────────────────────────────────────────────────
const fetchReviewQueue = async () => {
  try {
    const res = await authFetch('/api/review-queue')
    reviewQueue.value = await res.json()
  } catch {}
}

const startReview = async () => {
  await fetchReviewQueue()
  if (!reviewQueue.value.length) { showToast('暂无需要复习的笔记', 'info'); return }
  reviewIdx.value = 0
  reviewDone.value = false
  view.value = 'review'
  await loadReviewNote()
}

const loadReviewNote = async () => {
  const meta = reviewQueue.value[reviewIdx.value]
  if (!meta) { reviewDone.value = true; reviewNote.value = null; return }
  reviewLoading.value = true
  try {
    const res = await authFetch(`/api/notes/${meta.id}`)
    reviewNote.value = await res.json()
  } finally {
    reviewLoading.value = false
  }
}

const submitReview = async (rating: 'easy' | 'medium' | 'hard') => {
  if (!reviewNote.value) return
  try {
    await authFetch(`/api/notes/${reviewNote.value.id}/review`, {
      method: 'POST', headers: headers(), body: JSON.stringify({ rating }),
    })
    reviewIdx.value++
    if (reviewIdx.value >= reviewQueue.value.length) {
      reviewDone.value = true
      reviewNote.value = null
      await fetchReviewQueue()
    } else {
      await loadReviewNote()
    }
  } catch { showToast('提交失败，请重试', 'error') }
}

const enrollReview = async () => {
  if (!currentNote.value) return
  try {
    await authFetch(`/api/notes/${currentNote.value.id}/enroll-review`, { method: 'POST', headers: headers() })
    await fetchReviewQueue()
    showToast('已加入复习计划')
    const updated = await authFetch(`/api/notes/${currentNote.value.id}`)
    currentNote.value = await updated.json()
  } catch { showToast('操作失败', 'error') }
}

// ── Web Push ───────────────────────────────────────────────────────────────
const initPush = async () => {
  if (!pushSupported.value) return
  try {
    const reg = await navigator.serviceWorker.register('/sw.js')
    const existing = await reg.pushManager.getSubscription()
    pushSubscribed.value = !!existing
  } catch {}
}

const togglePushSubscription = async () => {
  if (!pushSupported.value || pushLoading.value) return
  pushLoading.value = true
  try {
    const reg = await navigator.serviceWorker.ready
    if (pushSubscribed.value) {
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await sub.unsubscribe()
        await authFetch('/api/push/unsubscribe', { method: 'DELETE', headers: headers(), body: JSON.stringify({ endpoint: sub.endpoint }) })
      }
      pushSubscribed.value = false
      showToast('已关闭推送通知')
    } else {
      const keyRes = await authFetch('/api/push/vapid-key')
      const { publicKey } = await keyRes.json()
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: publicKey,
      })
      await authFetch('/api/push/subscribe', { method: 'POST', headers: headers(), body: JSON.stringify({ subscription: sub }) })
      pushSubscribed.value = true
      showToast('已开启每日复习提醒')
    }
  } catch (err) {
    showToast('推送设置失败，请确认浏览器权限', 'error')
  } finally {
    pushLoading.value = false
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

// ── Chat ──────────────────────────────────────────────────────────────────────
const sendChat = async () => {
  if (!chatInput.value.trim() || isChatting.value || !currentNote.value) return
  const userMsg = chatInput.value.trim()
  chatInput.value = ''
  chatMessages.value.push({ role: 'user', content: userMsg })
  isChatting.value = true
  chatStreaming.value = ''
  try {
    const token = await props.getToken()
    const resp = await fetch(`/api/chat/${currentNote.value.id}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers(),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ messages: chatMessages.value }),
    })
    const reader = resp.body!.getReader()
    const decoder = new TextDecoder()
    let full = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      for (const line of decoder.decode(value, { stream: true }).split('\n')) {
        if (!line.startsWith('data: ')) continue
        const payload = line.slice(6).trim()
        if (payload === '[DONE]') break
        try {
          const d = JSON.parse(payload)
          if (d.content) { full += d.content; chatStreaming.value = full }
          if (d.error) showToast(d.error, 'error')
        } catch {}
      }
    }
    if (full) chatMessages.value.push({ role: 'assistant', content: full })
    chatStreaming.value = ''
  } catch {
    showToast('对话失败，请重试', 'error')
  } finally {
    isChatting.value = false
  }
}

watch([() => chatMessages.value.length, chatStreaming], async () => {
  await nextTick()
  chatScrollRef.value?.scrollTo({ top: chatScrollRef.value.scrollHeight })
})


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
    authFetch(`/api/notes/${note.id}`).then(r => r.json()).then(d => {
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
  fetchSpaces()
  fetchReviewQueue()
  initPush()
  window.addEventListener('keydown', handleGlobalKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
  if (compileProgressTimer) clearInterval(compileProgressTimer)
})
</script>

<template>
  <div class="app" :class="{ 'editor-mode': view === 'editor' }">

    <!-- Sidebar Backdrop (mobile) -->
    <div v-if="showMobileSidebar" class="sidebar-backdrop" @click="showMobileSidebar = false" />

    <!-- ── Sidebar ── -->
    <aside class="sidebar" :class="{ 'mobile-open': showMobileSidebar }">
      <div class="sidebar-top">
        <div class="brand">
          <svg viewBox="0 0 32 32" fill="none" width="28" height="28">
            <rect width="32" height="32" rx="8" fill="#1A1F2E"/>
            <polygon points="16,5 23,9 23,17 16,21 9,17 9,9" fill="none" stroke="#6366F1" stroke-width="1" opacity="0.55"/>
            <line x1="16" y1="13" x2="16" y2="5" stroke="#6366F1" stroke-width="0.9" opacity="0.45"/>
            <line x1="16" y1="13" x2="23" y2="17" stroke="#6366F1" stroke-width="0.9" opacity="0.45"/>
            <line x1="16" y1="13" x2="9" y2="17" stroke="#6366F1" stroke-width="0.9" opacity="0.45"/>
            <circle cx="16" cy="5" r="2" fill="#6366F1"/>
            <circle cx="23" cy="9" r="1.5" fill="#818CF8" opacity="0.8"/>
            <circle cx="23" cy="17" r="1.5" fill="#818CF8" opacity="0.8"/>
            <circle cx="16" cy="21" r="2" fill="#6366F1"/>
            <circle cx="9" cy="17" r="1.5" fill="#818CF8" opacity="0.8"/>
            <circle cx="9" cy="9" r="1.5" fill="#818CF8" opacity="0.8"/>
            <circle cx="16" cy="13" r="2.8" fill="#6366F1"/>
            <circle cx="16" cy="13" r="1.4" fill="#A5B4FC"/>
          </svg>
          <span class="brand-name">Vki</span>
          <button class="mobile-sidebar-close" @click="showMobileSidebar = false">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
              <line x1="3" y1="3" x2="13" y2="13"/><line x1="13" y1="3" x2="3" y2="13"/>
            </svg>
          </button>
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

      <!-- Space Switcher -->
      <div class="space-switcher">
        <div class="space-list">
          <div
            v-for="s in allSpaces" :key="s.name"
            class="space-item" :class="{ active: currentSpace === s.name }"
          >
            <span class="space-dot" />
            <template v-if="renamingSpace === s.name">
              <input
                ref="renameInputRef"
                v-model="renameValue"
                class="space-rename-input"
                @blur="commitRename"
                @keyup.enter="commitRename"
                @keyup.escape="renamingSpace = null"
                @click.stop
              />
            </template>
            <template v-else>
              <span class="space-name" @click="switchSpace(s.name)">{{ s.name }}</span>
              <span v-if="s.count" class="space-count">{{ s.count }}</span>
              <button class="space-edit-btn" title="重命名" @click.stop="startRename(s.name)">
                <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" width="10" height="10">
                  <path d="M7.5 1.5l3 3L3 12H0V9L7.5 1.5z"/>
                </svg>
              </button>
            </template>
          </div>
        </div>
        <div v-if="showNewSpace" class="space-new-row">
          <input
            ref="newSpaceInputRef"
            v-model="newSpaceName"
            class="space-new-input"
            placeholder="空间名称..."
            @keyup.enter="createSpace"
            @keyup.escape="showNewSpace = false"
          />
          <button class="space-confirm-btn" @click="createSpace">确定</button>
        </div>
        <button v-else class="space-add-btn" @click="showNewSpace = true; nextTick(() => newSpaceInputRef?.focus())">
          <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" width="10" height="10">
            <line x1="6" y1="1" x2="6" y2="11"/><line x1="1" y1="6" x2="11" y2="6"/>
          </svg>
          新建空间
        </button>
      </div>

      <!-- Nav -->
      <nav class="nav">
        <button
          class="nav-item" :class="{ active: view === 'review' }"
          @click="startReview"
        >
          <span class="nav-icon" style="color: #FBBF24">◷</span>
          <span class="nav-label">今日复习</span>
          <span v-if="reviewDueCount > 0" class="nav-badge">{{ reviewDueCount }}</span>
        </button>
        <button
          class="nav-item" :class="{ active: view === 'graph' }"
          @click="view = 'graph'; activeTag = null; searchQuery = ''"
        >
          <span class="nav-icon" style="color: #818CF8">⬡</span>
          <span class="nav-label">知识图谱</span>
        </button>
        <div class="nav-divider" />
        <button
          v-for="type in (['all', 'raw', 'entity', 'concept', 'summary', 'synthesis', 'comparison', 'qa'] as const)"
          :key="type"
          class="nav-item" :class="{ active: selectedType === type && !activeTag && view !== 'graph' }"
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
        <div class="user-row">
          <img v-if="user?.imageUrl" :src="user.imageUrl" class="user-avatar" :alt="userDisplayName" />
          <div v-else class="user-avatar-fallback">{{ userInitial }}</div>
          <span class="user-name" :title="userDisplayName">{{ userDisplayName }}</span>
          <button class="btn-signout" title="退出登录" @click="signOut()">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" width="13" height="13">
              <path d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>
              <polyline points="11,11 14,8 11,5"/>
              <line x1="14" y1="8" x2="6" y2="8"/>
            </svg>
          </button>
        </div>
        <button class="btn-settings" @click="emit('settings')">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" width="15" height="15">
            <circle cx="10" cy="10" r="2.5"/>
            <path d="M10 3v1.5M10 15.5V17M3 10h1.5M15.5 10H17M5.05 5.05l1.06 1.06M13.89 13.89l1.06 1.06M5.05 14.95l1.06-1.06M13.89 6.11l1.06-1.06"/>
          </svg>
          API 设置
        </button>
        <button v-if="pushSupported" class="btn-push-toggle" :class="{ subscribed: pushSubscribed }" :disabled="pushLoading" @click="togglePushSubscription">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" width="13" height="13">
            <path d="M8 1a5 5 0 0 1 5 5v3l1.5 2H1.5L3 9V6a5 5 0 0 1 5-5z"/>
            <path d="M6.5 13a1.5 1.5 0 0 0 3 0"/>
          </svg>
          {{ pushSubscribed ? '推送已开启' : '开启每日提醒' }}
        </button>
      </div>
    </aside>

    <!-- ── Main ── -->
    <main class="main" :class="{ 'viewer-chat-mode': view === 'viewer' && chatOpen }">

      <!-- Mobile Header -->
      <div class="mobile-header">
        <button class="mobile-hamburger" @click="showMobileSidebar = true">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
            <line x1="2" y1="4" x2="14" y2="4"/><line x1="2" y1="8" x2="14" y2="8"/><line x1="2" y1="12" x2="14" y2="12"/>
          </svg>
        </button>
        <span class="mobile-brand-name">Vki</span>
        <button class="mobile-new-btn" @click="openEditor()">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" width="14" height="14">
            <line x1="8" y1="2" x2="8" y2="14"/><line x1="2" y1="8" x2="14" y2="8"/>
          </svg>
        </button>
      </div>

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

        <template v-else-if="noteGroups">
          <div v-for="group in noteGroups" :key="group.date" class="date-group">
            <div class="date-group-header">{{ group.date }}</div>
            <div class="cards">
              <div
                v-for="note in group.items" :key="note.id"
                class="card" @click="openNote(note.id)"
              >
                <div v-if="note.read === false" class="unread-dot" />
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
          </div>
        </template>

        <div v-else class="cards">
          <div
            v-for="note in filteredNotes" :key="note.id"
            class="card" @click="openNote(note.id)"
          >
            <div v-if="note.read === false" class="unread-dot" />
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

      <!-- GRAPH VIEW -->
      <template v-else-if="view === 'graph'">
        <div class="graph-container">
          <GraphView
            :notes="notes"
            :compiling-ids="compilingIds"
            :search-query="searchQuery"
            @open-note="id => openNote(id)"
            @compile="compileFromGraph"
            @create-note="openEditor()"
          />
        </div>
      </template>

      <!-- REVIEW VIEW -->
      <template v-else-if="view === 'review'">
        <div class="review-header">
          <button class="btn-back" @click="view = 'list'">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
              <polyline points="10,3 4,8 10,13"/>
            </svg>
            返回
          </button>
          <h2 class="review-heading">今日复习</h2>
          <span v-if="!reviewDone" class="review-progress-text">{{ reviewIdx + 1 }} / {{ reviewQueue.length }}</span>
        </div>

        <!-- Done state -->
        <div v-if="reviewDone" class="review-done">
          <svg viewBox="0 0 48 48" fill="none" stroke="#34D399" stroke-width="2" width="52" height="52">
            <circle cx="24" cy="24" r="20"/><polyline points="14,24 20,30 34,16"/>
          </svg>
          <p class="review-done-title">全部复习完成！</p>
          <p class="review-done-sub">今日 {{ reviewQueue.length }} 条笔记已复习，保持下去 💪</p>
          <button class="btn-ghost" @click="view = 'list'">返回笔记列表</button>
        </div>

        <!-- Loading -->
        <div v-else-if="reviewLoading" class="review-loading">
          <div class="spinner" />
        </div>

        <!-- Flashcard -->
        <div v-else-if="reviewNote" class="review-card-wrap">
          <div class="review-progress-bar">
            <div class="review-progress-fill" :style="{ width: (reviewIdx / reviewQueue.length * 100) + '%' }" />
          </div>
          <div class="review-card">
            <div class="review-card-meta">
              <span class="card-type-badge" :style="{ color: TYPE_COLORS[reviewNote.type], borderColor: TYPE_COLORS[reviewNote.type] + '30', background: TYPE_COLORS[reviewNote.type] + '10' }">
                {{ TYPE_ICONS[reviewNote.type] }} {{ TYPE_LABELS[reviewNote.type] }}
              </span>
              <span v-if="reviewNote.reviewCount" class="review-count-badge">已复习 {{ reviewNote.reviewCount }} 次</span>
            </div>
            <h2 class="review-card-title">{{ reviewNote.title }}</h2>
            <div v-if="reviewNote.tags?.length" class="viewer-tags">
              <span v-for="tag in reviewNote.tags" :key="tag" class="tag">{{ tag }}</span>
            </div>
            <div class="review-card-content md-body" v-html="renderMarkdown(reviewNote.content)" @click="handleContentClick" />
          </div>
          <div class="review-rating">
            <p class="review-rating-label">记忆情况如何？</p>
            <div class="review-rating-btns">
              <button class="review-btn hard" @click="submitReview('hard')">
                <span class="review-btn-icon">😅</span>
                <span class="review-btn-label">困难</span>
                <span class="review-btn-hint">明天再来</span>
              </button>
              <button class="review-btn medium" @click="submitReview('medium')">
                <span class="review-btn-icon">🤔</span>
                <span class="review-btn-label">一般</span>
                <span class="review-btn-hint">{{ Math.round((reviewNote.reviewInterval || 1) * 1.5) }}天后</span>
              </button>
              <button class="review-btn easy" @click="submitReview('easy')">
                <span class="review-btn-icon">😊</span>
                <span class="review-btn-label">轻松</span>
                <span class="review-btn-hint">{{ Math.round((reviewNote.reviewInterval || 1) * 2.5) }}天后</span>
              </button>
            </div>
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
              <span class="btn-label">{{ copiedNote ? '已复制' : '复制' }}</span>
            </button>
            <button v-if="currentNote.type === 'raw'" class="btn-ghost-sm" @click="openEditor(currentNote)">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" width="13" height="13">
                <path d="M11 2l3 3-9 9H2v-3L11 2z"/>
              </svg>
              <span class="btn-label">编辑</span>
            </button>
            <!-- Enroll in spaced repetition -->
            <button class="btn-ghost-sm" :class="{ 'review-enrolled': currentNote.nextReviewAt }" @click="enrollReview">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" width="13" height="13">
                <circle cx="8" cy="8" r="6"/><polyline points="8,4 8,8 11,10"/>
              </svg>
              <span class="btn-label">{{ currentNote.nextReviewAt ? '复习中' : '加入复习' }}</span>
            </button>
            <!-- PPT button (desktop only) -->
            <button class="btn-ghost-sm btn-ppt-trigger" :disabled="isGeneratingPPT" @click="generatePPT">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" width="13" height="13">
                <rect x="1" y="2" width="14" height="12" rx="2"/>
                <path d="M5 6h3.5a1.5 1.5 0 0 1 0 3H5V6z"/>
                <line x1="5" y1="11" x2="8" y2="11"/>
              </svg>
              <span class="btn-label">{{ isGeneratingPPT ? '生成中' : 'PPT' }}</span>
            </button>
            <button class="btn-ghost-sm" :class="{ 'chat-active': chatOpen }" @click="chatOpen = !chatOpen">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" width="13" height="13">
                <path d="M14 2H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h3l3 3 3-3h3a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1z"/>
              </svg>
              <span class="btn-label">{{ chatOpen ? '收起' : '对话' }}</span>
            </button>
            <template v-if="confirmDeleteId === currentNote.id">
              <span class="delete-confirm-text"><span class="btn-label">确定删除？</span></span>
              <button class="btn-confirm-del" @click="deleteNote(currentNote.id); confirmDeleteId = null">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
                  <polyline points="2,4 14,4"/><path d="M5 4V2h6v2"/><rect x="3" y="4" width="10" height="10" rx="1"/>
                </svg>
                <span class="btn-label">删除</span>
              </button>
              <button class="btn-ghost-sm" @click="cancelDelete">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
                  <line x1="3" y1="3" x2="13" y2="13"/><line x1="13" y1="3" x2="3" y2="13"/>
                </svg>
                <span class="btn-label">取消</span>
              </button>
            </template>
            <button v-else class="btn-delete" @click="startDelete(currentNote.id)">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" width="14" height="14">
                <polyline points="2,4 14,4"/><path d="M5 4V2h6v2"/><path d="M6 7v5M10 7v5"/><rect x="3" y="4" width="10" height="10" rx="1"/>
              </svg>
            </button>
          </div>
        </div>

        <div class="viewer-content-wrap">
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
          </div>

          <!-- Right Links Panel -->
          <aside class="viewer-aside" v-if="outgoingLinks.length || backlinks.length">
            <!-- 我引用了谁 -->
            <div v-if="outgoingLinks.length" class="aside-section">
              <p class="aside-title">
                <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" width="11" height="11">
                  <line x1="2" y1="6" x2="10" y2="6"/><polyline points="7,3 10,6 7,9"/>
                </svg>
                引用了
              </p>
              <div class="aside-links">
                <button
                  v-for="note in outgoingLinks" :key="note.id"
                  class="aside-link"
                  @click="openNote(note.id)"
                >
                  <span class="aside-link-icon" :style="{ color: TYPE_COLORS[note.type] }">{{ TYPE_ICONS[note.type] }}</span>
                  {{ note.title }}
                </button>
              </div>
            </div>
            <!-- 谁引用了我 -->
            <div v-if="backlinks.length" class="aside-section">
              <p class="aside-title">
                <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" width="11" height="11">
                  <line x1="10" y1="6" x2="2" y2="6"/><polyline points="5,3 2,6 5,9"/>
                </svg>
                被引用
              </p>
              <div class="aside-links">
                <button
                  v-for="bl in backlinks" :key="bl.id"
                  class="aside-link backlink"
                  @click="openNote(bl.id)"
                >
                  <span class="aside-link-icon" :style="{ color: TYPE_COLORS[bl.type] }">{{ TYPE_ICONS[bl.type] }}</span>
                  {{ bl.title }}
                </button>
              </div>
            </div>
          </aside>
        </div>

        <!-- Chat Panel -->
        <div v-if="chatOpen" class="chat-panel">
          <div class="chat-panel-header">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" width="12" height="12" style="opacity:0.5">
              <path d="M14 2H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h3l3 3 3-3h3a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1z"/>
            </svg>
            与「{{ currentNote.title.length > 24 ? currentNote.title.slice(0, 23) + '…' : currentNote.title }}」对话
            <button class="chat-clear-btn" @click="chatMessages = []; chatStreaming = ''">清空</button>
          </div>
          <div class="chat-messages" ref="chatScrollRef">
            <div v-if="!chatMessages.length && !isChatting" class="chat-empty">
              <p>对这篇笔记有什么想问的？</p>
              <div class="chat-suggestions">
                <button class="chat-suggest" @click="chatInput = '帮我总结这篇笔记的核心内容'; sendChat()">总结核心内容</button>
                <button class="chat-suggest" @click="chatInput = '这篇笔记中有哪些关键概念？'; sendChat()">关键概念</button>
                <button class="chat-suggest" @click="chatInput = '基于这篇笔记，有哪些延伸思考？'; sendChat()">延伸思考</button>
              </div>
            </div>
            <div v-for="(msg, idx) in chatMessages" :key="idx" class="chat-msg" :class="msg.role">
              <div class="chat-bubble" :class="msg.role">
                <div v-if="msg.role === 'assistant'" class="md-body chat-md" v-html="renderMarkdown(msg.content)" />
                <span v-else>{{ msg.content }}</span>
              </div>
            </div>
            <div v-if="isChatting && chatStreaming" class="chat-msg assistant">
              <div class="chat-bubble assistant">
                <div class="md-body chat-md" v-html="renderMarkdown(chatStreaming)" />
                <span class="chat-cursor">▍</span>
              </div>
            </div>
            <div v-else-if="isChatting" class="chat-typing">
              <span /><span /><span />
            </div>
          </div>
          <div class="chat-input-row">
            <input
              v-model="chatInput"
              class="chat-input"
              placeholder="输入问题，Enter 发送…"
              :disabled="isChatting"
              @keydown.enter.prevent="sendChat"
            />
            <button class="chat-send" :disabled="isChatting || !chatInput.trim()" @click="sendChat">
              <svg viewBox="0 0 16 16" fill="currentColor" width="14" height="14">
                <path d="M14.5 1.5l-13 5.5 4 2 2 4.5 7-12z"/>
              </svg>
            </button>
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
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.user-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 8px;
}

.user-avatar {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.user-avatar-fallback {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: rgba(99, 102, 241, 0.25);
  color: var(--accent-lt);
  font-size: 12px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.user-name {
  flex: 1;
  font-size: 12px;
  color: var(--text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.btn-signout {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  background: transparent;
  border: none;
  border-radius: 5px;
  color: var(--text-3);
  cursor: pointer;
  transition: color 0.15s, background 0.15s;
  flex-shrink: 0;
}
.btn-signout:hover { color: #F87171; background: rgba(248,113,113,0.08); }

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
  position: relative;
}
.card:hover { border-color: rgba(99,102,241,0.35); transform: translateY(-1px); }

.unread-dot {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #F87171;
  box-shadow: 0 0 0 3px rgba(248,113,113,0.2);
  pointer-events: none;
}

/* ── Date Groups ── */
.date-group { display: flex; flex-direction: column; }

.date-group-header {
  padding: 16px 28px 10px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-3);
  text-transform: uppercase;
  letter-spacing: 0.6px;
  border-bottom: 1px solid var(--border);
}

.date-group .cards { border-bottom: none; }

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
  flex: 1;
  overflow-y: auto;
  min-width: 0;
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

.nav-divider {
  height: 1px;
  background: var(--border);
  margin: 4px 10px;
}

/* ── Graph ── */
.graph-container {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* ── Delete Confirmation ── */
.delete-confirm-text {
  font-size: 12px;
  color: #F87171;
}

.btn-confirm-del {
  display: inline-flex;
  align-items: center;
  padding: 6px 12px;
  background: rgba(248, 113, 113, 0.12);
  border: 1px solid rgba(248, 113, 113, 0.4);
  border-radius: 7px;
  color: #F87171;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-confirm-del:hover { background: rgba(248, 113, 113, 0.22); }

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

/* ── Viewer + Chat split layout ── */
.viewer-chat-mode {
  overflow: hidden;
}
.viewer-chat-mode .viewer-content-wrap {
  flex: 1;
  overflow: hidden;
}

/* ── Chat Panel ── */
.chat-panel {
  height: 340px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--border);
  background: var(--bg);
}

.chat-panel-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 9px 20px;
  border-bottom: 1px solid var(--border);
  font-size: 11px;
  color: var(--text-3);
  flex-shrink: 0;
}

.chat-clear-btn {
  margin-left: auto;
  background: transparent;
  border: none;
  font-size: 11px;
  color: var(--text-3);
  cursor: pointer;
  transition: color 0.15s;
  font-family: inherit;
  padding: 0;
}
.chat-clear-btn:hover { color: var(--text-2); }

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.chat-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 20px 0;
  color: var(--text-3);
  font-size: 13px;
}

.chat-suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: center;
}

.chat-suggest {
  padding: 5px 12px;
  background: rgba(99,102,241,0.07);
  border: 1px solid rgba(99,102,241,0.2);
  border-radius: 99px;
  font-size: 11px;
  color: var(--accent-lt);
  cursor: pointer;
  transition: all 0.15s;
  font-family: inherit;
}
.chat-suggest:hover { background: rgba(99,102,241,0.14); }

.chat-msg { display: flex; }
.chat-msg.user      { justify-content: flex-end; }
.chat-msg.assistant { justify-content: flex-start; }

.chat-bubble {
  max-width: 82%;
  padding: 8px 12px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.6;
}
.chat-bubble.user {
  background: rgba(99,102,241,0.15);
  color: var(--text);
  border-bottom-right-radius: 4px;
}
.chat-bubble.assistant {
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text-2);
  border-bottom-left-radius: 4px;
}

.chat-md { font-size: 13px; line-height: 1.65; }
.chat-md :deep(h1) { font-size: 15px; margin: 10px 0 6px; }
.chat-md :deep(h2) { font-size: 14px; margin: 8px 0 5px; }
.chat-md :deep(h3) { font-size: 13px; margin: 6px 0 4px; }
.chat-md :deep(p)  { margin-bottom: 6px; }
.chat-md :deep(ul), .chat-md :deep(ol) { padding-left: 16px; margin-bottom: 6px; }

.chat-cursor {
  display: inline-block;
  animation: blink 0.9s step-end infinite;
  color: var(--accent-lt);
  font-size: 14px;
  line-height: 1;
  margin-left: 2px;
  vertical-align: middle;
}
@keyframes blink { 0%, 100% { opacity: 1 } 50% { opacity: 0 } }

.chat-typing {
  display: flex;
  gap: 5px;
  padding: 6px 4px;
}
.chat-typing span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent-lt);
  animation: bounce 1.2s ease-in-out infinite;
  opacity: 0.5;
}
.chat-typing span:nth-child(2) { animation-delay: 0.15s; }
.chat-typing span:nth-child(3) { animation-delay: 0.30s; }
@keyframes bounce {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.4 }
  40%           { transform: translateY(-5px); opacity: 1 }
}

.chat-input-row {
  display: flex;
  gap: 8px;
  padding: 10px 14px;
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}

.chat-input {
  flex: 1;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 12px;
  color: var(--text);
  font-size: 13px;
  outline: none;
  font-family: inherit;
  transition: border-color 0.2s;
}
.chat-input:focus { border-color: var(--accent); }
.chat-input::placeholder { color: var(--text-3); }
.chat-input:disabled { opacity: 0.6; }

.chat-send {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: var(--accent);
  border: none;
  border-radius: 8px;
  color: #fff;
  cursor: pointer;
  transition: opacity 0.2s;
  flex-shrink: 0;
}
.chat-send:hover { opacity: 0.85; }
.chat-send:disabled { opacity: 0.3; cursor: default; }

.btn-ghost-sm.chat-active {
  border-color: rgba(99,102,241,0.35);
  color: var(--accent-lt);
  background: rgba(99,102,241,0.08);
}

/* ── Knowledge Spaces ── */
.space-switcher {
  padding: 8px 8px 6px;
  border-bottom: 1px solid var(--border);
}

.space-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin-bottom: 4px;
}

.space-item {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  padding: 5px 10px;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: var(--text-3);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
  text-align: left;
  font-family: inherit;
  box-sizing: border-box;
}
.space-item:hover { background: rgba(255,255,255,0.04); color: var(--text-2); }
.space-item.active { background: rgba(99,102,241,0.1); color: var(--text); }

.space-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgba(99,102,241,0.35);
  flex-shrink: 0;
  transition: background 0.15s;
}
.space-item.active .space-dot { background: var(--accent-lt); }

.space-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.space-count {
  font-size: 10px;
  color: var(--text-3);
  background: rgba(255,255,255,0.06);
  padding: 1px 5px;
  border-radius: 99px;
}

.space-add-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  width: 100%;
  padding: 5px 10px;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: var(--text-3);
  font-size: 11px;
  cursor: pointer;
  transition: color 0.15s;
  font-family: inherit;
}
.space-add-btn:hover { color: var(--text-2); }

.space-new-row {
  display: flex;
  gap: 4px;
  padding: 3px 2px;
}

.space-new-input {
  flex: 1;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 5px 8px;
  color: var(--text);
  font-size: 12px;
  outline: none;
  font-family: inherit;
  transition: border-color 0.2s;
}
.space-new-input:focus { border-color: var(--accent); }
.space-new-input::placeholder { color: var(--text-3); }

.space-confirm-btn {
  padding: 5px 10px;
  background: rgba(99,102,241,0.12);
  border: 1px solid rgba(99,102,241,0.25);
  border-radius: 6px;
  color: var(--accent-lt);
  font-size: 11px;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.15s;
  white-space: nowrap;
}
.space-confirm-btn:hover { background: rgba(99,102,241,0.2); }

.space-rename-input {
  flex: 1;
  background: var(--bg);
  border: 1px solid var(--accent);
  border-radius: 4px;
  padding: 2px 6px;
  color: var(--text);
  font-size: 12px;
  outline: none;
  font-family: inherit;
  min-width: 0;
}

.space-edit-btn {
  display: none;
  align-items: center;
  justify-content: center;
  padding: 2px;
  background: transparent;
  border: none;
  border-radius: 3px;
  color: var(--text-3);
  cursor: pointer;
  transition: color 0.15s, background 0.15s;
  flex-shrink: 0;
}
.space-edit-btn:hover { color: var(--text-2); background: rgba(255,255,255,0.06); }
.space-item:hover .space-edit-btn { display: flex; }

/* ── btn-label (hidden on mobile) ── */
.btn-label {
  /* visible on desktop, hidden on mobile via media query */
}

/* ── Mobile Header (hidden on desktop) ── */
.mobile-header {
  display: none;
}

.mobile-sidebar-close {
  display: none;
}

.sidebar-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  z-index: 150;
  backdrop-filter: blur(2px);
}

/* ── Responsive: Mobile ── */
@media (max-width: 768px) {

  /* Sidebar: slide-in overlay */
  .sidebar {
    position: fixed;
    left: 0;
    top: 0;
    bottom: 0;
    z-index: 200;
    width: 82%;
    max-width: 280px;
    transform: translateX(-100%);
    transition: transform 0.28s cubic-bezier(0.4, 0, 0.2, 1);
    border-right: 1px solid var(--border);
    box-shadow: 4px 0 24px rgba(0,0,0,0.5);
  }
  .sidebar.mobile-open {
    transform: translateX(0);
  }

  .mobile-sidebar-close {
    display: flex;
    align-items: center;
    justify-content: center;
    margin-left: auto;
    padding: 5px;
    background: transparent;
    border: none;
    border-radius: 6px;
    color: var(--text-3);
    cursor: pointer;
    transition: color 0.15s, background 0.15s;
    flex-shrink: 0;
  }
  .mobile-sidebar-close:hover { color: var(--text-2); background: rgba(255,255,255,0.06); }

  /* Mobile top header */
  .mobile-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
    background: var(--bg-card);
    flex-shrink: 0;
    position: sticky;
    top: 0;
    z-index: 50;
  }

  .mobile-hamburger {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 6px;
    background: transparent;
    border: none;
    border-radius: 7px;
    color: var(--text-2);
    cursor: pointer;
    transition: color 0.15s, background 0.15s;
    flex-shrink: 0;
  }
  .mobile-hamburger:hover { color: var(--text); background: rgba(255,255,255,0.06); }

  .mobile-brand-name {
    flex: 1;
    font-size: 16px;
    font-weight: 700;
    color: var(--text);
    letter-spacing: -0.3px;
  }

  .mobile-new-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    background: rgba(99, 102, 241, 0.12);
    border: 1px solid rgba(99, 102, 241, 0.25);
    border-radius: 8px;
    color: var(--accent-lt);
    cursor: pointer;
    transition: background 0.2s;
    flex-shrink: 0;
  }
  .mobile-new-btn:hover { background: rgba(99, 102, 241, 0.2); }

  /* Main content fills full width (sidebar is out of flow) */
  .main {
    min-width: 0;
    width: 100%;
  }

  /* Viewer header: compact icon-only buttons */
  .btn-label { display: none; }
  .btn-ppt-trigger { display: none; }

  .viewer-header {
    padding: 10px 14px;
    gap: 8px;
    flex-wrap: nowrap;
  }
  .viewer-meta { flex-shrink: 1; min-width: 0; }
  .viewer-date { display: none; }
  .viewer-actions { flex-wrap: nowrap; gap: 4px; flex-shrink: 0; }

  .btn-ghost-sm {
    padding: 7px 8px;
    gap: 0;
  }
  .delete-confirm-text { display: none; }
  .btn-confirm-del { padding: 6px 8px; }

  /* Tighten padding across views */
  .list-header { padding: 14px 16px 12px; }
  .cards {
    grid-template-columns: 1fr;
    padding: 12px 16px 28px;
    gap: 10px;
  }

  .viewer-body { padding: 16px 16px 40px; max-width: 100%; }
  .viewer-title { font-size: 20px; }

  .editor-header { padding: 12px 16px; }
  .editor-body { padding: 14px 16px 24px; }
  .editor-shortcut-hint { display: none; }

  /* Chat panel: tighter on mobile */
  .chat-panel { height: 260px; }
  .chat-messages { padding: 10px 14px; }
  .chat-input-row { padding: 8px 12px; }

  /* Editor mode: single column, no preview pane */
  .app.editor-mode .main {
    grid-template-columns: 1fr;
    grid-template-rows: auto auto 1fr;
    overflow: hidden;
  }
  .app.editor-mode .mobile-header {
    grid-column: 1;
    grid-row: 1;
  }
  .app.editor-mode .editor-header {
    grid-column: 1;
    grid-row: 2;
  }
  .app.editor-mode .editor-body {
    grid-column: 1;
    grid-row: 3;
    overflow-y: auto;
  }
  .app.editor-mode .editor-preview-pane {
    display: none !important;
  }

  .review-card { margin: 12px 12px 0; padding: 16px; }
  .review-rating-btns { gap: 8px; }
  .review-btn { padding: 10px 16px; min-width: 72px; }

  /* Right panel: hide on mobile */
  .viewer-aside { display: none; }
  .viewer-content-wrap { overflow-y: auto; }
  .viewer-body { overflow-y: visible; padding: 16px 16px 24px; max-width: 100%; }
}

/* ── Nav Badge ── */
.nav-badge {
  font-size: 10px;
  font-weight: 700;
  color: #fff;
  background: #FBBF24;
  padding: 1px 6px;
  border-radius: 99px;
  min-width: 18px;
  text-align: center;
}

/* ── Review View ── */
.review-header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 24px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-card);
  flex-shrink: 0;
}

.review-heading { font-size: 16px; font-weight: 600; color: var(--text); }

.review-progress-text {
  margin-left: auto;
  font-size: 12px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.review-done {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 60px 24px;
}

.review-done-title { font-size: 20px; font-weight: 700; color: var(--text); }
.review-done-sub { font-size: 14px; color: var(--text-3); }

.review-loading {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.review-card-wrap {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.review-progress-bar {
  height: 3px;
  background: rgba(99,102,241,0.12);
  flex-shrink: 0;
}

.review-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent-dk), var(--accent-lt));
  transition: width 0.5s ease;
}

.review-card {
  margin: 24px auto;
  width: 100%;
  max-width: 760px;
  padding: 28px 36px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.review-card-meta {
  display: flex;
  align-items: center;
  gap: 10px;
}

.review-count-badge {
  font-size: 11px;
  color: var(--text-3);
  background: rgba(255,255,255,0.05);
  padding: 2px 8px;
  border-radius: 99px;
}

.review-card-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--text);
  line-height: 1.3;
}

.review-card-content {
  border-top: 1px solid var(--border);
  padding-top: 16px;
}

.review-rating {
  padding: 20px 24px 32px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  flex-shrink: 0;
}

.review-rating-label {
  font-size: 13px;
  color: var(--text-3);
}

.review-rating-btns {
  display: flex;
  gap: 12px;
}

.review-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 24px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.2s;
  min-width: 88px;
}
.review-btn:hover { transform: translateY(-2px); }
.review-btn.hard:hover  { border-color: rgba(248,113,113,0.5); background: rgba(248,113,113,0.06); }
.review-btn.medium:hover { border-color: rgba(251,191,36,0.5); background: rgba(251,191,36,0.06); }
.review-btn.easy:hover  { border-color: rgba(52,211,153,0.5); background: rgba(52,211,153,0.06); }

.review-btn-icon { font-size: 22px; line-height: 1; }
.review-btn-label { font-size: 13px; font-weight: 600; color: var(--text); }
.review-btn-hint { font-size: 11px; color: var(--text-3); }

/* ── Viewer two-column layout ── */
.viewer-content-wrap {
  display: flex;
  flex-direction: row;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* ── Right links aside ── */
.viewer-aside {
  width: 216px;
  flex-shrink: 0;
  border-left: 1px solid var(--border);
  background: transparent;
  overflow-y: auto;
  padding: 18px 12px;
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.aside-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.aside-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  font-weight: 600;
  color: var(--text-3);
  text-transform: uppercase;
  letter-spacing: 0.8px;
  padding: 0 4px;
  margin-bottom: 4px;
}

.aside-links {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.aside-link {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  width: 100%;
  padding: 6px 8px;
  background: transparent;
  border: none;
  border-radius: 7px;
  color: var(--text-2);
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, transform 0.1s;
  font-family: inherit;
  line-height: 1.45;
  position: relative;
}
.aside-link::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%) scaleY(0);
  width: 2px;
  height: 60%;
  border-radius: 99px;
  background: var(--accent-lt);
  transition: transform 0.15s;
}
.aside-link:hover {
  background: rgba(99,102,241,0.08);
  color: var(--text);
  transform: translateX(1px);
}
.aside-link:hover::before { transform: translateY(-50%) scaleY(1); }

.aside-link.backlink::before { background: #34D399; }
.aside-link.backlink:hover {
  background: rgba(52,211,153,0.07);
  color: #34D399;
}

.aside-link-icon { font-size: 11px; flex-shrink: 0; margin-top: 2px; opacity: 0.8; }

/* ── Backlinks (old bottom sections — keep for mobile fallback) ── */
.viewer-backlinks {
  border-top: 1px solid var(--border);
  padding-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.backlink-btn {
  background: rgba(99,102,241,0.04);
  border-color: rgba(99,102,241,0.15);
  color: var(--text-3);
}
.backlink-btn:hover { background: rgba(99,102,241,0.1); color: var(--accent-lt); }

.backlink-icon {
  font-size: 11px;
  opacity: 0.5;
  margin-right: 2px;
}

/* ── Push Toggle ── */
.btn-push-toggle {
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
  font-family: inherit;
}
.btn-push-toggle:hover { color: var(--text-2); background: rgba(255,255,255,0.04); }
.btn-push-toggle.subscribed { color: #FBBF24; }
.btn-push-toggle:disabled { opacity: 0.5; cursor: default; }

/* ── Review enrolled button style ── */
.btn-ghost-sm.review-enrolled {
  border-color: rgba(251,191,36,0.35);
  color: #FBBF24;
  background: rgba(251,191,36,0.06);
}
</style>

