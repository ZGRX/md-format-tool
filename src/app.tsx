import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDownToLine, ArrowRight, Check, ChevronDown, Clipboard, Code2, FileText, FlaskConical,
  Image as ImageIcon, MessageCircle, PanelTop, RotateCcw, ShieldCheck, TriangleAlert, Upload, WandSparkles,
} from 'lucide-react'
import { analyze, applyEdits, offsetBeforeEdits, whitespaceEdits } from './format.ts'
import { fromClipboard } from './import-html.ts'
import { Preview } from './preview.tsx'
import { chatText, copyText, download, exportImages, exportWord, type ImageLayout, type WordMode } from './export.ts'
import { sample } from './sample.ts'

const targets = [
  { id: 'wechat', label: '微信分享', Icon: MessageCircle, action: '下载分享图片', format: 'PNG' },
  { id: 'word', label: 'Word 文档', Icon: FileText, action: '下载 Word', format: 'DOCX' },
  { id: 'markdown', label: 'Markdown 笔记', Icon: Code2, action: '下载 Markdown', format: 'MD' },
] as const

type Target = typeof targets[number]['id']
type Input = { source: string; kind: string; original: string }
const example: Input = { source: sample, kind: '线性代数示例', original: sample }
const exampleSelections = analyze(sample).suggestions.slice(1).map((item) => item.start)

export default function App() {
  const [input, setInput] = useState(example)
  const [source, setSource] = useState(sample)
  const [selected, setSelected] = useState<number[]>(exampleSelections)
  const [target, setTarget] = useState<Target>('wechat')
  const [originalView, setOriginalView] = useState(false)
  const [markdownView, setMarkdownView] = useState<'render' | 'source'>('render')
  const [clean, setClean] = useState(false)
  const [layout, setLayout] = useState<ImageLayout>('standard')
  const [wordMode, setWordMode] = useState<WordMode>('editable')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [drag, setDrag] = useState(false)
  const [conversionReady, setConversionReady] = useState<boolean | null>(null)
  const [wide, setWide] = useState(false)
  const editor = useRef<HTMLTextAreaElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const article = useRef<HTMLElement>(null)
  const reading = useRef(0)
  const analysis = useMemo(() => analyze(source), [source])
  const { result, appliedEdits, cleanupEdits } = useMemo(() => {
    const appliedEdits = [...analysis.normalized, ...analysis.suggestions.filter((item) => selected.includes(item.start))]
    const revised = applyEdits(source, appliedEdits)
    const cleanupEdits = clean ? whitespaceEdits(revised) : []
    return { result: applyEdits(revised, cleanupEdits), appliedEdits, cleanupEdits }
  }, [source, analysis, selected, clean])
  const activeAnalysis = useMemo(() => analyze(result), [result])
  const targetInfo = targets.find((item) => item.id === target)!
  const pending = analysis.suggestions.length - selected.length
  const diagnostics = activeAnalysis.diagnostics.map((item) => {
    const start = offsetBeforeEdits(offsetBeforeEdits(item.start, cleanupEdits), appliedEdits)
    return { ...item, line: source.slice(0, start).split('\n').length }
  })
  const filename = (result.match(/^#\s+(.+)/m)?.[1] ?? (input.kind.endsWith('.md') ? input.kind.slice(0, -3) : '整理后的笔记'))
    .trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').slice(0, 80) || '整理后的笔记'
  const invalidMath = activeAnalysis.diagnostics.some((item) => item.formula)

  useEffect(() => {
    if (target !== 'word') return
    let current = true
    fetch('/api/word').then((response) => { if (current) setConversionReady(response.status === 204) })
      .catch(() => { if (current) setConversionReady(false) })
    return () => { current = false }
  }, [target])

  useEffect(() => {
    const note = article.current
    if (!note) return
    function measure() {
      setWide(Array.from(note!.querySelectorAll<HTMLElement>('.table-scroll, .katex-display'))
        .some((node) => node.scrollWidth > node.clientWidth + 2))
    }
    const observer = new ResizeObserver(measure)
    observer.observe(note)
    document.fonts.ready.then(measure)
    measure()
    return () => observer.disconnect()
  }, [result, target, markdownView, layout])

  function edit(value: string) {
    reading.current++
    const next = analyze(value)
    setSelected((previous) => {
      const stillSelected = analysis.suggestions.filter((item) => previous.includes(item.start))
      return next.suggestions.filter((item) => {
        const same = stillSelected.find((old) => old.start === item.start && old.original === item.original)
        const unique = next.suggestions.filter((candidate) => candidate.original === item.original).length === 1
          && analysis.suggestions.filter((candidate) => candidate.original === item.original).length === 1
        return same || (unique && stillSelected.some((old) => old.original === item.original))
      }).map((item) => item.start)
    })
    setSource(value)
    setError('')
    setNotice('')
  }

  function load(next: Input, selections: number[] = []) {
    reading.current++
    setInput(next)
    setSource(next.source)
    setSelected(selections)
    setOriginalView(false)
    setError('')
    setNotice('')
  }

  async function importFile(file?: File) {
    if (!file) return
    const revision = ++reading.current
    try {
      if (!/\.md$/i.test(file.name)) throw new Error('请选择一个 .md 文件。')
      if (file.size > 2_000_000) throw new Error('请选择 2 MB 以内的 Markdown 文件。')
      const value = await file.text()
      if (revision === reading.current) load({ source: value, original: value, kind: file.name })
    } catch (problem) {
      if (revision === reading.current) setError(problem instanceof Error ? problem.message : '读取文件失败。')
    }
  }

  async function paste() {
    const revision = ++reading.current
    try {
      let text = ''
      let html = ''
      if (navigator.clipboard.read) {
        try {
          const items = await navigator.clipboard.read()
          const item = items.find((entry) => entry.types.includes('text/html') || entry.types.includes('text/plain'))
          if (item?.types.includes('text/html')) html = await (await item.getType('text/html')).text()
          if (item?.types.includes('text/plain')) text = await (await item.getType('text/plain')).text()
        } catch {
          text = await navigator.clipboard.readText()
        }
      } else {
        text = await navigator.clipboard.readText()
      }
      if (revision !== reading.current) return
      if (!text && !html) throw new Error('剪贴板没有可导入的文字。')
      load(fromClipboard(text, html))
    } catch {
      if (revision !== reading.current) return
      editor.current?.focus()
      setNotice('请在原文输入区按 ⌘V 或 Ctrl+V 粘贴。')
    }
  }

  function jump(line: number) {
    if (originalView) setOriginalView(false)
    requestAnimationFrame(() => {
      const lines = source.split('\n')
      const start = lines.slice(0, line - 1).reduce((offset, text) => offset + text.length + 1, 0)
      editor.current?.focus()
      editor.current?.setSelectionRange(start, start + (lines[line - 1]?.length || 0))
      if (editor.current) editor.current.scrollTop = Math.max(0, (line - 4) * 22)
    })
  }

  async function output(copy = false) {
    if (!result.trim() || busy) return
    setError('')
    setNotice('')
    setBusy(true)
    try {
      if (copy) {
        await copyText(target === 'wechat' && article.current ? chatText(article.current) : result)
        setNotice(target === 'wechat' ? '已复制聊天文字。' : '已复制 Markdown。')
      } else if (target === 'wechat' && article.current) {
        const count = await exportImages(article.current, filename, layout)
        setNotice(count === 1 ? '已生成分享图片。' : '已生成 ' + count + ' 张分享图片，已打包为 ZIP。')
      } else if (target === 'word') {
        if (invalidMath && wordMode === 'editable') {
          throw new Error('请修正公式，或在公式选项中选择「错误处保留源码」。')
        }
        await exportWord(result, filename, wordMode)
        setNotice('已生成 Word 文档。')
      } else {
        download(new Blob([result], { type: 'text/markdown;charset=utf-8' }), filename + '.md')
        setNotice('已生成 Markdown 文件。')
      }
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : '导出失败，请重试。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand"><span className="brand-mark"><WandSparkles size={20} /></span>格式工坊</div>
          <div className="privacy"><ShieldCheck size={16} /> 本机处理</div>
        </div>
      </header>

      <main>
        <div className="intro">
          <div>
            <h1>AI 内容格式转换</h1>
            <p>整理公式、表格和代码，导出到微信、Word 或 Obsidian。</p>
          </div>
          <button className="secondary example" onClick={() => load(example, exampleSelections)}><FlaskConical size={16} />载入示例</button>
        </div>

        <div className="workspace">
          <section className="panel editor-panel" aria-labelledby="source-heading">
            <div className="panel-heading">
              <div><span className="section-icon"><Clipboard size={17} /></span><h2 id="source-heading">原文</h2></div>
              <div className="source-buttons">
                <button className="subtle" onClick={paste}><Clipboard size={15} />粘贴</button>
                <button className="subtle" onClick={() => fileInput.current?.click()}><Upload size={15} />导入</button>
                <input type="file" ref={fileInput} accept=".md" hidden onChange={(event) => {
                  void importFile(event.currentTarget.files?.[0])
                  event.currentTarget.value = ''
                }} />
              </div>
            </div>

            <div className={'editor-shell' + (drag ? ' drag-over' : '')}
              onDragOver={(event) => {
                if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); setDrag(true) }
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(event) => {
                if (!event.dataTransfer.files.length) return
                event.preventDefault()
                setDrag(false)
                if (event.dataTransfer.files.length === 1) void importFile(event.dataTransfer.files[0])
                else setError('每次请选择一个 .md 文件。')
              }}>
              <div className="editor-top">
                <span title={input.kind}><span className="dot" />{input.kind}</span>
                <button className="text-button" onClick={() => setOriginalView(!originalView)}>
                  {originalView ? '返回编辑' : '查看原始输入'}
                </button>
              </div>
              <textarea ref={editor} aria-label={originalView ? '原始输入' : '编辑原文'} spellCheck={false}
                value={originalView ? input.original : source} readOnly={originalView}
                placeholder="粘贴 AI 回答，或把一个 .md 文件拖到这里"
                onChange={(event) => edit(event.target.value)}
                onPaste={(event) => {
                  if (originalView) return
                  const text = event.clipboardData.getData('text/plain')
                  const html = event.clipboardData.getData('text/html')
                  if (!text && !html) return
                  event.preventDefault()
                  const next = fromClipboard(text, html)
                  const field = event.currentTarget
                  if (!source || (field.selectionStart === 0 && field.selectionEnd === source.length)) {
                    load(next)
                  } else {
                    const cursor = field.selectionStart + next.source.length
                    edit(source.slice(0, field.selectionStart) + next.source + source.slice(field.selectionEnd))
                    requestAnimationFrame(() => field.setSelectionRange(cursor, cursor))
                  }
                }} />
              <div className="editor-status">
                <span>{source ? source.split('\n').length : 0} 行 · {source.length} 字符</span>
                <button className="text-button" onClick={() => load(input, input === example ? exampleSelections : [])}
                  disabled={source === input.source && !originalView}><RotateCcw size={13} />恢复原文</button>
              </div>
            </div>

            <div className="review">
              <div className="review-heading">
                <div><WandSparkles size={17} /><h3>格式修复</h3>{pending > 0 && <span className="pending">{pending} 项待确认</span>}</div>
                {analysis.suggestions.length > 0 && <button className="text-button accent" onClick={() => {
                  setSelected(pending ? analysis.suggestions.map((item) => item.start) : [])
                }}>{pending ? '应用全部' : '取消全部'}</button>}
              </div>
              {analysis.normalized.length > 0 && <p className="review-detail">已统一 {analysis.normalized.length} 处明确的公式分隔符。</p>}
              {analysis.suggestions.length === 0 && diagnostics.length === 0 && <p className="review-detail">没有需要确认的修复。</p>}
              {analysis.suggestions.length > 0 && <div className="suggestions">
                {analysis.suggestions.toSorted((a, b) => Number(selected.includes(a.start)) - Number(selected.includes(b.start)))
                  .map((item) => {
                    const applied = selected.includes(item.start)
                    return <label className={'suggestion' + (applied ? ' applied' : '')} key={item.start}>
                      <input type="checkbox" checked={applied} onChange={() => setSelected((previous) => applied
                        ? previous.filter((start) => start !== item.start) : [...previous, item.start])} />
                      <span className="suggestion-content">
                        <span className="suggestion-meta">第 {item.line} 行 <span>·</span> {item.reason}</span>
                        <span className="suggestion-diff"><code>{item.original}</code><ArrowRight size={13} /><code>{item.replacement}</code></span>
                      </span>
                    </label>
                  })}
              </div>}
              <label className="cleanup"><input type="checkbox" checked={clean} onChange={(event) => setClean(event.target.checked)} />清理文档首尾的多余空行</label>
            </div>
          </section>

          <section className="panel output-panel" aria-labelledby="preview-heading">
            <div className="panel-heading">
              <div><span className="section-icon"><PanelTop size={17} /></span><h2 id="preview-heading">输出预览</h2></div>
              <span className="format-label">{targetInfo.format}</span>
            </div>
            <div className="target-tabs" role="group" aria-label="输出格式">
              {targets.map(({ id, label, Icon }) => <button key={id} aria-pressed={target === id} disabled={busy} onClick={() => {
                setTarget(id); setError(''); setNotice(''); setWide(false)
              }}><Icon size={17} />{label}</button>)}
            </div>
            <div className="preview-toolbar">
              {target === 'wechat' && <>
                <span><ImageIcon size={15} />手机阅读布局</span>
                <label className="select-wrap" aria-label="图片布局"><select value={layout}
                  onChange={(event) => setLayout(event.target.value as ImageLayout)}>
                  <option value="standard">标准分页</option><option value="compact">较短表格分段</option><option value="wide">宽版图片</option>
                </select><ChevronDown size={13} /></label>
              </>}
              {target === 'word' && <>
                <span>文档版式预览</span>
                <label className="select-wrap" aria-label="Word 公式处理"><select value={wordMode} onChange={(event) => setWordMode(event.target.value as WordMode)}>
                  <option value="editable">可编辑公式</option>
                  <option value="image">公式转图片</option>
                  <option value="literal">错误处保留源码</option>
                </select><ChevronDown size={13} /></label>
              </>}
              {target === 'markdown' && <>
                <span>Obsidian · Markdown</span>
                <div className="view-switch" role="group" aria-label="Markdown 预览模式">
                  <button aria-pressed={markdownView === 'render'} onClick={() => setMarkdownView('render')}>渲染</button>
                  <button aria-pressed={markdownView === 'source'} onClick={() => setMarkdownView('source')}>源码</button>
                </div>
              </>}
            </div>
            {(diagnostics.length > 0 || wide || (target === 'word' && conversionReady === false)) &&
              <div className="diagnostics" aria-label="格式问题">
                {wide && <p><TriangleAlert size={15} />内容较宽，预览可横向滚动。{target === 'wechat' && '可选宽版图片，导出时会缩放超宽内容。'}</p>}
                {target === 'word' && conversionReady === false && <p><TriangleAlert size={15} />Word 转换需要本机 Pandoc，安装后重新打开此选项。</p>}
                {diagnostics.map((item, index) => <p key={index}><TriangleAlert size={15} />
                  <button className="text-button" onClick={() => jump(item.line)}>第 {item.line} 行</button>{item.message}</p>)}
              </div>}
            <div className={'preview-board ' + target + (target === 'wechat' && layout === 'wide' ? ' wide' : '')}>
              {!result.trim() ? <div className="empty"><FileText size={30} /><p>粘贴或导入内容后，预览会显示在这里。</p></div>
                : target === 'markdown' && markdownView === 'source'
                  ? <pre className="markdown-output">{result}</pre>
                  : <article className="note preview-note" ref={article}><Preview source={result} /></article>}
            </div>
            <div className="export-footer">
              <div className={'export-status' + (error ? ' error' : '')} role={error ? 'alert' : 'status'}>
                {error ? <TriangleAlert size={15} /> : notice ? <Check size={15} /> : null}
                <span>{error || notice || (target === 'word' ? '由本机 Pandoc 转换' : target === 'wechat' ? '多页图片会打包为 ZIP' : '保留公式源码与文档结构')}</span>
              </div>
              <div className="export-buttons">
                {target !== 'word' && <button className="secondary" disabled={!result.trim() || busy} onClick={() => output(true)}>
                  <Clipboard size={16} />{target === 'wechat' ? '复制聊天文字' : '复制 Markdown'}
                </button>}
                <button className="primary" disabled={!result.trim() || busy || (target === 'word' && conversionReady === false)} onClick={() => output()}>
                  <ArrowDownToLine size={17} />{busy ? '处理中…' : targetInfo.action}
                </button>
              </div>
            </div>
          </section>
        </div>
      </main>
    </>
  )
}
