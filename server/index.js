import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import matter from 'gray-matter'
import { v4 as uuidv4 } from 'uuid'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { clerkMiddleware, getAuth } from '@clerk/express'
import pptxgen from 'pptxgenjs'
import webpush from 'web-push'

dotenv.config()

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Use a persistent volume on Railway (DATA_DIR=/data), fall back to local server/data/ for dev
const BASE_DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, 'data')

if (!fs.existsSync(BASE_DATA_DIR)) fs.mkdirSync(BASE_DATA_DIR, { recursive: true })

// On first volume deploy: seed git-tracked notes into the volume (skip if file already exists)
if (process.env.DATA_DIR) {
  const seedDir = path.join(__dirname, 'data')
  if (fs.existsSync(seedDir)) {
    for (const entry of fs.readdirSync(seedDir)) {
      const srcUser = path.join(seedDir, entry)
      if (!fs.statSync(srcUser).isDirectory()) continue
      const dstUser = path.join(BASE_DATA_DIR, entry)
      if (!fs.existsSync(dstUser)) fs.mkdirSync(dstUser, { recursive: true })
      for (const file of fs.readdirSync(srcUser)) {
        const dst = path.join(dstUser, file)
        if (!fs.existsSync(dst)) fs.copyFileSync(path.join(srcUser, file), dst)
      }
    }
  }
}

const app = express()
app.use(cors())
app.use(express.json({ limit: '2mb' }))
app.use(clerkMiddleware())

const NOTE_TYPES = ['raw', 'entity', 'concept', 'summary', 'synthesis', 'comparison', 'qa']

const TYPE_LABELS = {
  raw: '原始笔记', entity: '实体', concept: '概念',
  summary: '摘要', synthesis: '综合', comparison: '对比', qa: '问答',
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const requireUser = (req, res, next) => {
  const { userId } = getAuth(req)
  if (!userId) return res.status(401).json({ error: '未登录' })
  req.userId = userId
  next()
}

const userDir = (userId) => {
  const dir = path.join(BASE_DATA_DIR, userId)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

const notePath = (userId, id) => path.join(userDir(userId), `${id}.md`)

const spacesFilePath = (userId) => path.join(userDir(userId), '__spaces__.json')

const readUserSpaces = (userId) => {
  const fp = spacesFilePath(userId)
  if (!fs.existsSync(fp)) return ['默认']
  try { return JSON.parse(fs.readFileSync(fp, 'utf8')) }
  catch { return ['默认'] }
}

const writeUserSpaces = (userId, spaces) => {
  fs.writeFileSync(spacesFilePath(userId), JSON.stringify(spaces), 'utf8')
}

const userSettingsPath = (userId) => path.join(userDir(userId), '__user_settings__.json')

const readUserSettings = (userId) => {
  const fp = userSettingsPath(userId)
  if (!fs.existsSync(fp)) return {}
  try { return JSON.parse(fs.readFileSync(fp, 'utf8')) }
  catch { return {} }
}

const writeUserSettings = (userId, settings) => {
  fs.writeFileSync(userSettingsPath(userId), JSON.stringify(settings), 'utf8')
}

// ── VAPID / Web Push helpers ───────────────────────────────────────────────

const vapidFilePath = path.join(BASE_DATA_DIR, '__vapid__.json')

function getVapidKeys() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY }
  }
  if (fs.existsSync(vapidFilePath)) {
    try { return JSON.parse(fs.readFileSync(vapidFilePath, 'utf8')) } catch {}
  }
  const keys = webpush.generateVAPIDKeys()
  fs.writeFileSync(vapidFilePath, JSON.stringify(keys), 'utf8')
  return keys
}

const vapidKeys = getVapidKeys()
webpush.setVapidDetails('mailto:noreply@vki.app', vapidKeys.publicKey, vapidKeys.privateKey)

const pushSubsPath = (userId) => path.join(userDir(userId), '__push_subs__.json')

const readPushSubs = (userId) => {
  const fp = pushSubsPath(userId)
  if (!fs.existsSync(fp)) return []
  try { return JSON.parse(fs.readFileSync(fp, 'utf8')) } catch { return [] }
}

const writePushSubs = (userId, subs) => {
  fs.writeFileSync(pushSubsPath(userId), JSON.stringify(subs), 'utf8')
}

const readNote = (userId, id) => {
  const fp = notePath(userId, id)
  if (!fs.existsSync(fp)) return null
  const { data, content } = matter.read(fp)
  return { ...data, content: content.trim() }
}

const writeNote = (userId, meta, content) => {
  const fp = notePath(userId, meta.id)
  const str = matter.stringify(content || '', meta)
  fs.writeFileSync(fp, str, 'utf8')
}

const listNotes = (userId) => {
  const dir = userDir(userId)
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .map(f => {
      const { data, content } = matter.read(path.join(dir, f))
      if (!data.id) return null
      const preview = content.trim()
        .slice(0, 150)
        .replace(/#{1,6}\s/g, '')
        .replace(/\*\*/g, '')
        .replace(/\*/g, '')
        .replace(/\[\[([^\]]+)\]\]/g, '$1')
        .trim()
      return { ...data, preview }
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.updated) - new Date(a.updated))
}

// ── Routes ────────────────────────────────────────────────────────────────────

// List all notes (metadata only)
app.get('/api/notes', requireUser, (req, res) => {
  try {
    const { space } = req.query
    let notes = listNotes(req.userId)
    if (space) notes = notes.filter(n => (n.space || '默认') === space)
    res.json(notes)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Get single note (with content) — marks unread notes as read on first open
app.get('/api/notes/:id', requireUser, (req, res) => {
  const note = readNote(req.userId, req.params.id)
  if (!note) return res.status(404).json({ error: '笔记不存在' })
  if (note.read === false) {
    const { content, ...meta } = note
    writeNote(req.userId, { ...meta, read: true }, content)
    note.read = true
  }
  res.json(note)
})

// Create raw note
app.post('/api/notes', requireUser, (req, res) => {
  const { title, content, tags, space } = req.body
  if (!title?.trim()) return res.status(400).json({ error: '请输入标题' })

  const now = new Date().toISOString()
  const id = `note_${Date.now()}_${uuidv4().slice(0, 6)}`
  const meta = {
    id, type: 'raw', title: title.trim(),
    tags: tags || [], links: [],
    space: space || '默认',
    created: now, updated: now,
  }
  writeNote(req.userId, meta, content || '')
  res.json(meta)
})

// Update note
app.put('/api/notes/:id', requireUser, (req, res) => {
  const note = readNote(req.userId, req.params.id)
  if (!note) return res.status(404).json({ error: '笔记不存在' })

  const { title, content, tags, space } = req.body
  const { content: _c, ...meta } = note
  const updated = {
    ...meta,
    title: title ?? meta.title,
    tags: tags ?? meta.tags,
    space: space ?? meta.space ?? '默认',
    updated: new Date().toISOString(),
  }
  writeNote(req.userId, updated, content ?? _c ?? '')
  res.json(updated)
})

// Delete note
app.delete('/api/notes/:id', requireUser, (req, res) => {
  const fp = notePath(req.userId, req.params.id)
  if (!fs.existsSync(fp)) return res.status(404).json({ error: '笔记不存在' })
  fs.unlinkSync(fp)
  res.json({ ok: true })
})

// Compile raw note → wiki pages via LLM
app.post('/api/compile/:id', requireUser, async (req, res) => {
  const apiKey = req.headers['x-api-key']
  const baseUrl = (req.headers['x-base-url'] || 'https://bobdong.cn/v1').replace(/\/$/, '')

  if (!apiKey) return res.status(401).json({ error: '请先配置你的 API Key' })

  const note = readNote(req.userId, req.params.id)
  if (!note) return res.status(404).json({ error: '笔记不存在' })
  if (note.type !== 'raw') return res.status(400).json({ error: '只能编译原始笔记' })

  const prompt = `Title: ${note.title}\n\n${note.content}`

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5.4',
        messages: [
          {
            role: 'system',
            content: `You are a knowledge compilation engine. Analyze the given note and generate structured wiki pages.
Return ONLY valid JSON (no markdown code blocks, no explanation). Include only types that are relevant to the note content:
{
  "entity":     { "title": "...", "content": "markdown content with [[wikilinks]] for key concepts", "links": ["linked title 1"] },
  "concept":    { "title": "...", "content": "...", "links": [] },
  "summary":    { "title": "...", "content": "...", "links": [] },
  "synthesis":  { "title": "...", "content": "...", "links": [] },
  "comparison": { "title": "...", "content": "use markdown table for comparisons", "links": [] },
  "qa":         { "title": "...", "content": "use **Q:** ... **A:** ... format for each pair", "links": [] }
}
Rules:
- Use [[double brackets]] for key terms and concepts that link internally
- Write in the same language as the input note
- Be concise and factual
- Only include types that have meaningful content for this note`,
          },
          { role: 'user', content: prompt },
        ],
        max_tokens: 3000,
      }),
      signal: AbortSignal.timeout(60_000),
    })

    const data = await response.json()
    if (data.error) return res.status(500).json({ error: `API 错误：${data.error.message || JSON.stringify(data.error)}` })
    const raw = data.choices?.[0]?.message?.content?.trim()
    if (!raw) return res.status(500).json({ error: 'LLM 返回为空，请重试' })

    // Strip markdown code fences if present
    const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    let pages
    try {
      pages = JSON.parse(jsonStr)
    } catch {
      console.error('[compile] JSON parse failed:', raw.slice(0, 200))
      return res.status(500).json({ error: '解析 LLM 输出失败，请重试' })
    }

    const now = new Date().toISOString()
    const created = []

    for (const type of NOTE_TYPES.filter(t => t !== 'raw')) {
      const page = pages[type]
      if (!page?.title || !page?.content) continue

      const id = `note_${Date.now()}_${type}`
      const meta = {
        id, type, title: page.title,
        tags: [], links: page.links || [],
        sourceId: note.id,
        space: note.space || '默认',
        created: now, updated: now,
      }
      writeNote(req.userId, meta, page.content)
      created.push({ id, type, title: page.title })
      // Small delay to ensure unique timestamps
      await new Promise(r => setTimeout(r, 5))
    }

    // Mark original note as compiled
    const { content: rawContent, ...rawMeta } = note
    writeNote(req.userId, { ...rawMeta, compiledAt: now, updated: now }, rawContent)

    res.json({ pages: created })
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误'
    console.error('[compile] error:', message)
    res.status(500).json({ error: message })
  }
})

// Chat with a note — streaming SSE
app.post('/api/chat/:noteId', requireUser, async (req, res) => {
  const apiKey = req.headers['x-api-key']
  const baseUrl = (req.headers['x-base-url'] || 'https://bobdong.cn/v1').replace(/\/$/, '')

  if (!apiKey) return res.status(401).json({ error: '请先配置你的 API Key' })

  const note = readNote(req.userId, req.params.noteId)
  if (!note) return res.status(404).json({ error: '笔记不存在' })

  const { messages } = req.body
  if (!Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ error: '缺少消息' })
  }

  const systemPrompt = `You are a knowledge assistant for a personal wiki. The user wants to discuss or ask questions about a specific note. Be concise and insightful. Reply in the same language as the user's question.

Note title: ${note.title}
Note type: ${note.type}
Note content:
${note.content}`

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  try {
    const upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5.4',
        stream: true,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
        max_tokens: 1500,
      }),
      signal: AbortSignal.timeout(60_000),
    })

    if (!upstream.ok) {
      const err = await upstream.json()
      res.write(`data: ${JSON.stringify({ error: err.error?.message || '上游错误' })}\n\n`)
      return res.end()
    }

    const reader = upstream.body.getReader()
    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      for (const line of decoder.decode(value, { stream: true }).split('\n')) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const payload = trimmed.slice(5).trim()
        if (payload === '[DONE]') { res.write('data: [DONE]\n\n'); break }
        try {
          const delta = JSON.parse(payload).choices?.[0]?.delta?.content
          if (delta) res.write(`data: ${JSON.stringify({ content: delta })}\n\n`)
        } catch {}
      }
    }
    res.end()
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err instanceof Error ? err.message : '未知错误' })}\n\n`)
    res.end()
  }
})

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))

// List knowledge spaces (derived from note metadata)
app.get('/api/spaces', requireUser, (req, res) => {
  try {
    const notes = listNotes(req.userId)
    const saved = readUserSpaces(req.userId)
    const counts = {}
    // Seed with saved spaces so empty ones are preserved
    for (const sp of saved) counts[sp] = 0
    // Count notes per space
    for (const note of notes) {
      const sp = note.space || '默认'
      counts[sp] = (counts[sp] || 0) + 1
    }
    const result = Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => {
        if (a.name === '默认') return -1
        if (b.name === '默认') return 1
        return a.name.localeCompare(b.name)
      })
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Build PPTX from note via LLM
// Create / register a new space
app.post('/api/spaces', requireUser, (req, res) => {
  const { name } = req.body
  if (!name?.trim()) return res.status(400).json({ error: '请输入空间名称' })
  const cleanName = name.trim()
  const spaces = readUserSpaces(req.userId)
  if (!spaces.includes(cleanName)) {
    spaces.push(cleanName)
    writeUserSpaces(req.userId, spaces)
  }
  res.json({ ok: true, name: cleanName })
})

// Rename a space (updates all notes in that space)
app.put('/api/spaces/rename', requireUser, (req, res) => {
  const { oldName, newName } = req.body
  if (!oldName || !newName?.trim()) return res.status(400).json({ error: '请提供空间名称' })
  const cleanNew = newName.trim()
  if (cleanNew === oldName) return res.json({ ok: true, newName: cleanNew })

  const spaces = readUserSpaces(req.userId)
  const idx = spaces.indexOf(oldName)
  if (idx < 0) return res.status(404).json({ error: '空间不存在' })
  spaces[idx] = cleanNew
  writeUserSpaces(req.userId, spaces)

  // Update all notes in this space
  const dir = userDir(req.userId)
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.md'))) {
    const fp = path.join(dir, file)
    const { data, content } = matter.read(fp)
    if (!data.id) continue
    if ((data.space || '默认') === oldName) {
      writeNote(req.userId, { ...data, space: cleanNew }, content.trim())
    }
  }

  res.json({ ok: true, newName: cleanNew })
})

// User settings (API key sync across devices)
app.get('/api/user-settings', requireUser, (req, res) => {
  const s = readUserSettings(req.userId)
  res.json({ apiKey: s.apiKey || '', baseUrl: s.baseUrl || '', synced: !!s.apiKey })
})

app.put('/api/user-settings', requireUser, (req, res) => {
  const { apiKey, baseUrl } = req.body
  const cur = readUserSettings(req.userId)
  writeUserSettings(req.userId, { ...cur, ...(apiKey !== undefined && { apiKey }), ...(baseUrl !== undefined && { baseUrl }) })
  res.json({ ok: true })
})

// Spaced repetition review queue
app.get('/api/review-queue', requireUser, (req, res) => {
  try {
    const now = new Date().toISOString()
    const allNotes = listNotes(req.userId)
    const due = allNotes.filter(n => n.nextReviewAt && n.nextReviewAt <= now)
    res.json(due)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Submit a spaced repetition review (SM-2 algorithm)
app.post('/api/notes/:id/review', requireUser, (req, res) => {
  const note = readNote(req.userId, req.params.id)
  if (!note) return res.status(404).json({ error: '笔记不存在' })

  const { rating } = req.body // 'easy' | 'medium' | 'hard'
  const { content: noteContent, ...meta } = note

  const prevInterval = meta.reviewInterval || 1
  const reviewCount = (meta.reviewCount || 0) + 1

  let interval
  if (rating === 'easy')        interval = Math.min(60, Math.round(Math.max(1, prevInterval) * 2.5))
  else if (rating === 'medium') interval = Math.min(60, Math.round(Math.max(1, prevInterval) * 1.5))
  else                          interval = 1 // hard: reset to 1 day

  const now = new Date()
  const nextReview = new Date(now.getTime() + interval * 24 * 60 * 60 * 1000)

  const updated = {
    ...meta,
    reviewInterval: interval,
    reviewCount,
    reviewedAt: now.toISOString(),
    nextReviewAt: nextReview.toISOString(),
    updated: now.toISOString(),
  }
  writeNote(req.userId, updated, noteContent)
  res.json(updated)
})

// Enroll a note in spaced repetition (sets nextReviewAt = now)
app.post('/api/notes/:id/enroll-review', requireUser, (req, res) => {
  const note = readNote(req.userId, req.params.id)
  if (!note) return res.status(404).json({ error: '笔记不存在' })
  const { content: noteContent, ...meta } = note
  const now = new Date().toISOString()
  const updated = { ...meta, reviewInterval: 1, reviewCount: 0, nextReviewAt: now, updated: now }
  writeNote(req.userId, updated, noteContent)
  res.json(updated)
})

// Web Push: get VAPID public key
app.get('/api/push/vapid-key', requireUser, (req, res) => {
  res.json({ publicKey: vapidKeys.publicKey })
})

// Web Push: subscribe
app.post('/api/push/subscribe', requireUser, (req, res) => {
  const { subscription } = req.body
  if (!subscription?.endpoint) return res.status(400).json({ error: '无效的推送订阅' })
  const subs = readPushSubs(req.userId)
  if (!subs.find(s => s.endpoint === subscription.endpoint)) {
    subs.push(subscription)
    writePushSubs(req.userId, subs)
  }
  res.json({ ok: true })
})

// Web Push: unsubscribe
app.delete('/api/push/unsubscribe', requireUser, (req, res) => {
  const { endpoint } = req.body
  writePushSubs(req.userId, readPushSubs(req.userId).filter(s => s.endpoint !== endpoint))
  res.json({ ok: true })
})

async function fetchImageData(keywords) {
  try {
    const url = `https://source.unsplash.com/1280x720/?${encodeURIComponent(keywords)}`
    const resp = await fetch(url, { signal: AbortSignal.timeout(7000) })
    if (!resp.ok) return null
    const buf = await resp.arrayBuffer()
    const ct = resp.headers.get('content-type') || 'image/jpeg'
    return `data:${ct};base64,${Buffer.from(buf).toString('base64')}`
  } catch { return null }
}

async function buildPPT(outline) {
  const prs = new pptxgen()
  prs.layout = 'LAYOUT_WIDE'

  const accent = ['4F46E5', '7C3AED', '0EA5E9', '059669', 'D97706', 'DC2626', 'EC4899']

  // ── Title slide ──────────────────────────────────────────────────────────
  const title = prs.addSlide()
  const coverImg = await fetchImageData(outline.cover_keywords || outline.title.slice(0, 40))
  if (coverImg) {
    title.background = { data: coverImg }
    title.addShape(prs.ShapeType.rect, { x: 0, y: 0, w: 10, h: 5.63, fill: { color: '000000', transparency: 30 } })
  } else {
    title.background = { color: '0A0D14' }
    title.addShape(prs.ShapeType.ellipse, { x: 6.8, y: -1.2, w: 5, h: 5, fill: { color: '6366F1', transparency: 88 }, line: { color: '6366F1', transparency: 100 } })
  }

  title.addText(outline.title || '演示文稿', {
    x: 0.5, y: 1.5, w: 9, h: 2.2,
    fontSize: 38, bold: true, color: 'F1F5F9', align: 'center', wrap: true,
    shadow: { type: 'outer', color: '000000', opacity: 0.7, blur: 10, offset: 3, angle: 45 },
  })
  if (outline.subtitle) {
    title.addText(outline.subtitle, {
      x: 0.5, y: 3.9, w: 9, h: 0.9,
      fontSize: 18, color: 'CBD5E1', align: 'center',
    })
  }

  // ── Content slides ────────────────────────────────────────────────────────
  const slides = outline.slides || []
  for (let idx = 0; idx < slides.length; idx++) {
    const sd = slides[idx]
    const color = accent[idx % accent.length]
    const s = prs.addSlide()
    s.background = { color: '0A0D14' }

    // Left accent bar
    s.addShape(prs.ShapeType.rect, { x: 0, y: 0, w: 0.07, h: 5.63, fill: { color }, line: { color, transparency: 100 } })
    // Decorative glow circle top-right
    s.addShape(prs.ShapeType.ellipse, { x: 8.0, y: -1.0, w: 3.2, h: 3.2, fill: { color, transparency: 88 }, line: { color, transparency: 100 } })

    // Slide image (right panel) — fetch only for first 3 content slides to keep speed reasonable
    let hasImg = false
    if (sd.keywords && idx < 3) {
      const img = await fetchImageData(sd.keywords)
      if (img) {
        s.addImage({ data: img, x: 5.9, y: 0.95, w: 3.9, h: 3.75 })
        s.addShape(prs.ShapeType.rect, { x: 5.9, y: 0.95, w: 3.9, h: 3.75, fill: { color: '000000', transparency: 65 }, line: { color, transparency: 80, width: 0.5 } })
        hasImg = true
      }
    }

    const textW = hasImg ? 5.65 : 9.7

    // Title
    s.addText(sd.title || '', { x: 0.25, y: 0.2, w: textW, h: 0.78, fontSize: 22, bold: true, color: 'A5B4FC', wrap: true })
    // Divider
    s.addShape(prs.ShapeType.line, { x: 0.25, y: 1.05, w: textW, h: 0, line: { color, width: 0.75 } })

    if (sd.bullets?.length) {
      s.addText(sd.bullets.map(b => `  •  ${b}`).join('\n'), {
        x: 0.25, y: 1.2, w: textW, h: 4.1,
        fontSize: 15, color: 'CBD5E1', lineSpacingMultiple: 1.6, valign: 'top', wrap: true,
      })
    }

    s.addText(`${idx + 1} / ${slides.length}`, { x: 8.5, y: 5.2, w: 1.2, h: 0.3, fontSize: 10, color: '334155', align: 'right' })
  }

  return prs
}

app.post('/api/ppt/:noteId', requireUser, async (req, res) => {
  const apiKey = req.headers['x-api-key']
  const baseUrl = (req.headers['x-base-url'] || 'https://bobdong.cn/v1').replace(/\/$/, '')
  if (!apiKey) return res.status(401).json({ error: '请先配置你的 API Key' })

  const note = readNote(req.userId, req.params.noteId)
  if (!note) return res.status(404).json({ error: '笔记不存在' })

  // Aggregate compiled wiki pages for richer PPT content
  const allNotes = listNotes(req.userId)
  const compiledPages = allNotes.filter(n => n.sourceId === note.id)
  let fullContent = `# ${note.title}\n\n${note.content}`
  for (const page of compiledPages) {
    const detail = readNote(req.userId, page.id)
    if (detail?.content) {
      const label = TYPE_LABELS[page.type] || page.type
      fullContent += `\n\n---\n## [${label}] ${page.title}\n\n${detail.content}`
    }
  }

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-5.4',
        messages: [
          {
            role: 'system',
            content: `You are a presentation designer. Generate a slide deck outline from the given note.
Return ONLY valid JSON (no markdown fences):
{
  "title": "presentation title",
  "subtitle": "optional one-line tagline",
  "cover_keywords": "3 comma-separated English keywords for cover photo search (e.g. \"technology,innovation,data\")",
  "slides": [
    { "title": "slide title", "bullets": ["point 1", "point 2", "point 3"], "keywords": "2-3 English keywords for image" }
  ]
}
Rules: 5-8 slides, 3-5 concise bullets each (10-25 words), same language as input for title/subtitle/bullets, keywords must be English only, presentation-appropriate tone.`,
          },
          { role: 'user', content: fullContent },
        ],
        max_tokens: 2000,
      }),
      signal: AbortSignal.timeout(60_000),
    })

    const data = await response.json()
    if (data.error) return res.status(500).json({ error: `API 错误：${data.error.message || JSON.stringify(data.error)}` })

    const raw = data.choices?.[0]?.message?.content?.trim()
    if (!raw) return res.status(500).json({ error: 'LLM 返回为空，请重试' })

    const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    let outline
    try { outline = JSON.parse(jsonStr) }
    catch { return res.status(500).json({ error: '解析幻灯片内容失败，请重试' }) }

    const prs = await buildPPT(outline)
    const buffer = await prs.write('nodebuffer')

    const safeName = (note.title || 'presentation').replace(/[^\w一-龥 \-]/g, '').trim().slice(0, 40) || 'presentation'
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation')
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}.pptx`)
    res.send(buffer)
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : '未知错误' })
  }
})

// ── Daily Review Push Scheduler ──────────────────────────────────────────────

async function sendDailyReviewPushes() {
  try {
    const now = new Date().toISOString()
    for (const entry of fs.readdirSync(BASE_DATA_DIR)) {
      const userPath = path.join(BASE_DATA_DIR, entry)
      if (!fs.statSync(userPath).isDirectory()) continue
      if (entry.startsWith('__')) continue
      const userId = entry
      const subs = readPushSubs(userId)
      if (!subs.length) continue
      const allNotes = listNotes(userId)
      const dueCount = allNotes.filter(n => n.nextReviewAt && n.nextReviewAt <= now).length
      if (!dueCount) continue
      const payload = JSON.stringify({
        title: 'Vki 复习提醒',
        body: `你有 ${dueCount} 条笔记需要复习`,
        url: '/',
      })
      for (const sub of subs) {
        try {
          await webpush.sendNotification(sub, payload)
        } catch (err) {
          if (err.statusCode === 410) {
            writePushSubs(userId, readPushSubs(userId).filter(s => s.endpoint !== sub.endpoint))
          }
        }
      }
    }
  } catch (err) {
    console.error('[push] sendDailyReviewPushes error:', err)
  }
}

function scheduleDailyReview() {
  const now = new Date()
  const next9am = new Date(now)
  next9am.setHours(9, 0, 0, 0)
  if (next9am <= now) next9am.setDate(next9am.getDate() + 1)
  const delay = next9am.getTime() - now.getTime()
  setTimeout(() => {
    sendDailyReviewPushes()
    setInterval(sendDailyReviewPushes, 24 * 60 * 60 * 1000)
  }, delay)
  console.log(`📅 Daily review push scheduled for ${next9am.toLocaleTimeString()}`)
}

scheduleDailyReview()

// One-time migration: move root data/*.md into data/{userId}/
app.post('/api/migrate', (req, res) => {
  const { secret, userId } = req.body
  if (secret !== process.env.MIGRATE_SECRET || !userId) {
    return res.status(403).json({ error: 'forbidden' })
  }
  const files = fs.readdirSync(BASE_DATA_DIR).filter(f => f.endsWith('.md'))
  const dest = userDir(userId)
  let moved = 0
  for (const f of files) {
    const src = path.join(BASE_DATA_DIR, f)
    const dst = path.join(dest, f)
    if (!fs.existsSync(dst)) {
      fs.renameSync(src, dst)
      moved++
    }
  }
  res.json({ moved, total: files.length })
})

// Serve built frontend in production
const PUBLIC_DIR = path.join(__dirname, 'public')
if (fs.existsSync(PUBLIC_DIR)) {
  app.use(express.static(PUBLIC_DIR))
  app.get('*', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')))
}

const PORT = process.env.PORT || 3004
app.listen(PORT, () => console.log(`📝 ai-notes server: http://localhost:${PORT}`))
