import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import matter from 'gray-matter'
import { v4 as uuidv4 } from 'uuid'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

dotenv.config()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, 'data')

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })

const app = express()
app.use(cors())
app.use(express.json({ limit: '2mb' }))

const NOTE_TYPES = ['raw', 'entity', 'concept', 'summary', 'synthesis', 'comparison', 'qa']

const TYPE_LABELS = {
  raw: '原始笔记', entity: '实体', concept: '概念',
  summary: '摘要', synthesis: '综合', comparison: '对比', qa: '问答',
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const notePath = (id) => path.join(DATA_DIR, `${id}.md`)

const readNote = (id) => {
  const fp = notePath(id)
  if (!fs.existsSync(fp)) return null
  const { data, content } = matter.read(fp)
  return { ...data, content: content.trim() }
}

const writeNote = (meta, content) => {
  const fp = notePath(meta.id)
  const str = matter.stringify(content || '', meta)
  fs.writeFileSync(fp, str, 'utf8')
}

const listNotes = () => {
  return fs.readdirSync(DATA_DIR)
    .filter(f => f.endsWith('.md'))
    .map(f => {
      const { data, content } = matter.read(path.join(DATA_DIR, f))
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
app.get('/api/notes', (_req, res) => {
  try {
    res.json(listNotes())
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Get single note (with content)
app.get('/api/notes/:id', (req, res) => {
  const note = readNote(req.params.id)
  if (!note) return res.status(404).json({ error: '笔记不存在' })
  res.json(note)
})

// Create raw note
app.post('/api/notes', (req, res) => {
  const { title, content, tags } = req.body
  if (!title?.trim()) return res.status(400).json({ error: '请输入标题' })

  const now = new Date().toISOString()
  const id = `note_${Date.now()}_${uuidv4().slice(0, 6)}`
  const meta = {
    id, type: 'raw', title: title.trim(),
    tags: tags || [], links: [],
    created: now, updated: now,
  }
  writeNote(meta, content || '')
  res.json(meta)
})

// Update note
app.put('/api/notes/:id', (req, res) => {
  const note = readNote(req.params.id)
  if (!note) return res.status(404).json({ error: '笔记不存在' })

  const { title, content, tags } = req.body
  const { content: _c, ...meta } = note
  const updated = {
    ...meta,
    title: title ?? meta.title,
    tags: tags ?? meta.tags,
    updated: new Date().toISOString(),
  }
  writeNote(updated, content ?? _c ?? '')
  res.json(updated)
})

// Delete note
app.delete('/api/notes/:id', (req, res) => {
  const fp = notePath(req.params.id)
  if (!fs.existsSync(fp)) return res.status(404).json({ error: '笔记不存在' })
  fs.unlinkSync(fp)
  res.json({ ok: true })
})

// Compile raw note → wiki pages via LLM
app.post('/api/compile/:id', async (req, res) => {
  const apiKey = req.headers['x-api-key']
  const baseUrl = (req.headers['x-base-url'] || 'https://bobdong.cn/v1').replace(/\/$/, '')

  if (!apiKey) return res.status(401).json({ error: '请先配置你的 API Key' })

  const note = readNote(req.params.id)
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
        model: 'gpt-4.1',
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
        created: now, updated: now,
      }
      writeNote(meta, page.content)
      created.push({ id, type, title: page.title })
      // Small delay to ensure unique timestamps
      await new Promise(r => setTimeout(r, 5))
    }

    // Mark original note as compiled
    const { content: rawContent, ...rawMeta } = note
    writeNote({ ...rawMeta, compiledAt: now, updated: now }, rawContent)

    res.json({ pages: created })
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误'
    console.error('[compile] error:', message)
    res.status(500).json({ error: message })
  }
})

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))

const PORT = process.env.PORT || 3004
app.listen(PORT, () => console.log(`📝 ai-notes server: http://localhost:${PORT}`))
