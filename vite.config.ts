import { spawn } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import JSZip from 'jszip'
import { defineConfig, type Plugin } from 'vite'

const bodyLimit = 12_000_000
const docxType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

function pandocPath() {
  if (process.env.PANDOC_PATH) return process.env.PANDOC_PATH
  if (existsSync('.tools')) {
    for (const folder of readdirSync('.tools')) {
      const path = resolve('.tools', folder, 'bin/pandoc')
      if (folder.startsWith('pandoc-') && existsSync(path)) return path
    }
  }
  return 'pandoc'
}

function runPandoc(args: string[], input?: string) {
  return new Promise<Buffer>((resolve, reject) => {
    const child = spawn(pandocPath(), args, { stdio: ['pipe', 'pipe', 'pipe'], timeout: 30_000, killSignal: 'SIGKILL' })
    const output: Buffer[] = []
    const errors: Buffer[] = []
    child.stdout.on('data', (chunk: Buffer) => output.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => errors.push(chunk))
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve(Buffer.concat(output))
      else reject(new Error(Buffer.concat(errors).toString().trim() || 'Pandoc 转换超时或意外退出。'))
    })
    child.stdin.on('error', () => {})
    child.stdin.end(input)
  })
}

async function localizeDocx(docx: Buffer) {
  const zip = await JSZip.loadAsync(docx)
  const styles = zip.file('word/styles.xml')
  if (styles) {
    const xml = await styles.async('string')
    zip.file('word/styles.xml', xml
      .replace(/ w:eastAsia="[^"]*"/g, '')
      .replace(/<w:rFonts\b[^>]*?\/?>(?=\s*)/g, (tag) => tag
        .replace(/ w:eastAsiaTheme="[^"]*"/g, '')
        .replace(/(\/?>)$/, ' w:eastAsia="Microsoft YaHei"$1'))
      .replace(/<w:lang\b[^>]*?\/?>/g, '<w:lang w:val="en-US" w:eastAsia="zh-CN" />'))
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

function wordExport(): Plugin {
  let active = false
  const middleware = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (req.url !== '/api/word') return next()
    const reply = (code: number, error: string) => {
      res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
      res.end(JSON.stringify({ error }))
    }
    if (req.method === 'GET') {
      try {
        await runPandoc(['--version'])
        res.writeHead(204, { 'Cache-Control': 'no-store' }).end()
      } catch {
        reply(503, '未找到 Pandoc。安装后重试，或启动时设置 PANDOC_PATH。')
      }
      return
    }
    if (req.method !== 'POST' || req.headers['content-type'] !== 'text/markdown; charset=utf-8') {
      return reply(415, 'Word 接口仅接收 UTF-8 Markdown。')
    }
    if (req.headers.origin && req.headers.origin !== 'http://' + req.headers.host) {
      return reply(403, '请从本地格式工坊发起转换。')
    }
    if (active) return reply(429, '正在转换另一份文档，请稍后重试。')
    active = true
    try {
      const chunks: Buffer[] = []
      let size = 0
      for await (const chunk of req) {
        size += chunk.length
        if (size > bodyLimit) return reply(413, '文档超过 Word 转换的 12 MB 上限。')
        chunks.push(chunk)
      }
      if (!size) return reply(400, '请先输入需要转换的内容。')
      const docx = await runPandoc([
        '--from=commonmark_x+tex_math_dollars-raw_html-raw_attribute', '--to=docx',
        '--sandbox', '--fail-if-warnings',
      ], Buffer.concat(chunks).toString('utf8'))
      const output = await localizeDocx(docx)
      res.writeHead(200, { 'Content-Type': docxType, 'Cache-Control': 'no-store' })
      res.end(output)
    } catch (error) {
      const detail = error instanceof Error ? error.message : '转换失败。'
      reply(detail.includes('ENOENT') ? 503 : 422, detail.includes('ENOENT')
        ? '未找到 Pandoc。安装后重试，或启动时设置 PANDOC_PATH。'
        : detail.slice(0, 3000))
    } finally {
      active = false
    }
  }
  return {
    name: 'local-word-export',
    configureServer(server) { server.middlewares.use(middleware) },
    configurePreviewServer(server) { server.middlewares.use(middleware) },
  }
}

export default defineConfig({
  plugins: [react(), wordExport()],
  optimizeDeps: {
    include: [
      'html-to-image',
      'jszip',
      'mathjax-full/js/mathjax.js',
      'mathjax-full/js/adaptors/liteAdaptor.js',
      'mathjax-full/js/handlers/html.js',
      'mathjax-full/js/input/mathml.js',
      'mathjax-full/js/output/svg.js',
    ],
  },
})
