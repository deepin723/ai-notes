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

// Get single note (with content)
app.get('/api/notes/:id', requireUser, (req, res) => {
  const note = readNote(req.userId, req.params.id)
  if (!note) return res.status(404).json({ error: '笔记不存在' })
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
    const counts = {}
    for (const note of notes) {
      const sp = note.space || '默认'
      counts[sp] = (counts[sp] || 0) + 1
    }
    if (!Object.keys(counts).length) counts['默认'] = 0
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
function buildPPT(outline) {
  const prs = new pptxgen()
  prs.layout = 'LAYOUT_WIDE'

  const title = prs.addSlide()
  title.background = { color: '0A0D14' }
  title.addText(outline.title || '演示文稿', {
    x: 0.5, y: 1.6, w: 9, h: 2,
    fontSize: 34, bold: true, color: 'F1F5F9',
    align: 'center', wrap: true,
  })
  if (outline.subtitle) {
    title.addText(outline.subtitle, {
      x: 0.5, y: 3.8, w: 9, h: 0.8,
      fontSize: 17, color: '94A3B8', align: 'center',
    })
  }

  for (let idx = 0; idx < (outline.slides || []).length; idx++) {
    const sd = outline.slides[idx]
    const s = prs.addSlide()
    s.background = { color: '0A0D14' }

    s.addText(sd.title || '', {
      x: 0.5, y: 0.3, w: 8.5, h: 0.75,
      fontSize: 22, bold: true, color: 'A5B4FC', wrap: true,
    })

    if (sd.bullets?.length) {
      const lines = sd.bullets.map(b => `  •  ${b}`).join('\n')
      s.addText(lines, {
        x: 0.5, y: 1.2, w: 9, h: 4.2,
        fontSize: 16, color: 'CBD5E1',
        lineSpacingMultiple: 1.6, valign: 'top', wrap: true,
      })
    }

    s.addText(`${idx + 1} / ${(outline.slides || []).length}`, {
      x: 8.5, y: 5.1, w: 1, h: 0.3,
      fontSize: 10, color: '334155', align: 'right',
    })
  }
  return prs
}

app.post('/api/ppt/:noteId', requireUser, async (req, res) => {
  const apiKey = req.headers['x-api-key']
  const baseUrl = (req.headers['x-base-url'] || 'https://bobdong.cn/v1').replace(/\/$/, '')
  if (!apiKey) return res.status(401).json({ error: '请先配置你的 API Key' })

  const note = readNote(req.userId, req.params.noteId)
  if (!note) return res.status(404).json({ error: '笔记不存在' })

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
  "slides": [
    { "title": "slide title", "bullets": ["point 1", "point 2", "point 3"] }
  ]
}
Rules: 5-8 slides, 3-5 concise bullets each (10-25 words), same language as input, presentation-appropriate tone.`,
          },
          { role: 'user', content: `Title: ${note.title}\n\n${note.content}` },
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

    const prs = buildPPT(outline)
    const buffer = await prs.write('nodebuffer')

    const safeName = (note.title || 'presentation').replace(/[^\w一-龥 \-]/g, '').trim().slice(0, 40) || 'presentation'
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation')
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}.pptx`)
    res.send(buffer)
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : '未知错误' })
  }
})

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
