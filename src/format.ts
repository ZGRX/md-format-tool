import katex from 'katex'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath)

export interface Edit {
  start: number
  end: number
  replacement: string
}

export interface Suggestion extends Edit {
  original: string
  line: number
  reason: string
}

export interface Diagnostic {
  line: number
  message: string
  start: number
  formula?: Edit
}

const lineNumber = (source: string, offset: number) => source.slice(0, offset).split('\n').length

export function applyEdits(source: string, edits: Edit[]) {
  let end = source.length
  let output = ''
  for (const edit of edits.toSorted((a, b) => b.start - a.start)) {
    output = edit.replacement + source.slice(edit.end, end) + output
    end = edit.start
  }
  return source.slice(0, end) + output
}

function mathRange(source: string, pattern: RegExp, start: number) {
  const boundary = /\r?\n[ \t]*\r?\n/.exec(source.slice(start))
  const end = boundary ? start + boundary.index : source.length
  pattern.lastIndex = start
  const match = pattern.exec(source)
  return match && match.index < end ? match : null
}

export function analyze(source: string) {
  const tree = parser.parse(source)
  const protectedRanges: Array<[number, number]> = []
  const tableRanges: Array<[number, number]> = []
  const unevenRows: Array<[number, number]> = []
  const imageFallbacks: Edit[] = []
  const diagnostics: Diagnostic[] = []
  const formulas: Array<Edit & { tex: string; display: boolean; line: number }> = []
  visit(tree, (node, _index, parent) => {
    const start = node.position?.start.offset
    const end = node.position?.end.offset
    if (start === undefined || end === undefined) return
    const line = node.position!.start.line
    if (node.type === 'table') tableRanges.push([start, end])
    if (node.type === 'tableRow' && parent?.type === 'table' && node.children.length > parent.children[0].children.length) {
      unevenRows.push([start, end])
    }
    if (['code', 'inlineCode', 'math', 'inlineMath', 'link', 'linkReference',
      'image', 'imageReference', 'definition', 'footnoteReference', 'html'].includes(node.type)) {
      protectedRanges.push([start, end])
    }
    if (node.type === 'math' || node.type === 'inlineMath') {
      const display = node.type === 'math'
      const tex = node.value
      const formula = { start, end, replacement: literal(source.slice(start, end)), tex, display, line }
      formulas.push(formula)
      if (display && !/\$\$\s*$/.test(source.slice(start + 2, end))) {
        diagnostics.push({ start, line, message: '块公式缺少结尾的 $$。', formula })
      } else {
        const error = formulaError(tex, display)
        if (error) diagnostics.push({ start, line, message: error, formula })
      }
    }
    if (node.type === 'image' || node.type === 'imageReference') {
      if (node.type === 'imageReference' || !isEmbeddedImage(node.url)) {
        imageFallbacks.push({ start, end, replacement: literal('【图片 · ' + (node.alt || '未加载的资源') + '】') })
        diagnostics.push({ start, line, message: '图片预览和图片/Word 导出会显示占位文字。Markdown 保留图片地址。' })
      }
    }
    if (node.type === 'html' && /<(?:iframe|video|audio|object|embed|svg|img|table)\b/i.test(node.value)) {
      diagnostics.push({ start, line, message: '嵌入的 HTML 可能仅在支持该结构的 Markdown 工具中显示。' })
    }
  })

  protectedRanges.sort((a, b) => a[0] - b[0])
  const suggestions: Suggestion[] = []
  const normalized: Edit[] = []
  const opens = /(?<!\\)\\[[(]|(?<!\\)[[(]|(?<![\\$])[$]{1,2}(?!\$)/g
  let range = 0
  for (let match = opens.exec(source); match; match = opens.exec(source)) {
    const start = match.index
    while (protectedRanges[range] && protectedRanges[range][1] <= start) range++
    const protectedRange = protectedRanges[range]
    if (protectedRange && protectedRange[0] <= start) {
      // remark treats standalone single-line $$…$$ as inline.
      if (match[0] === '$$' && start === protectedRange[0]) {
        const formula = formulas.find((entry) => entry.start === start)
        const size = formula && source.slice(start, formula.end).match(/^\$\$[^\r\n]+\$\$$/)
        if (formula && size && standalone(source, start, formula.end)) {
          normalized.push({ start, end: formula.end, replacement: blockMath(formula.tex) })
        }
      }
      opens.lastIndex = protectedRange[1]
      continue
    }
    const delimiter = match[0]
    const table = tableRanges.find(([from, to]) => start >= from && start < to)
    if (delimiter.startsWith('$')) {
      const row = unevenRows.find(([from, to]) => start >= from && start < to)
      const finish = row && source.indexOf(delimiter, start + delimiter.length)
      if (row && finish && finish > start && finish + delimiter.length <= row[1]
        && (!protectedRange || protectedRange[0] >= finish + delimiter.length)) {
        const tex = source.slice(start + delimiter.length, finish)
        if (/(?<!\\)\|/.test(tex) && !/\$/.test(tex)) {
          normalized.push({
            start, end: finish + delimiter.length,
            replacement: '$' + tex.trim().replace(/(?<!\\)\|/g, '\\vert ') + '$',
          })
          opens.lastIndex = finish + delimiter.length
        }
      }
      continue
    }
    const explicit = delimiter.startsWith('\\')
    const isBracket = delimiter.endsWith('[')
    const bodyStart = start + delimiter.length
    let close: number
    let end: number
    if (explicit) {
      const closing = mathRange(source, isBracket ? /(?<!\\)\\\]/g : /(?<!\\)\\\)/g, bodyStart)
      if (!closing || (!isBracket && source.slice(bodyStart, closing.index).includes('\n'))) {
        diagnostics.push({ start, line: lineNumber(source, start), message: 'LaTeX 分隔符缺少对应的结束符号。' })
        continue
      }
      close = closing.index
      end = close + 2
    } else if (isBracket) {
      const openingLine = /^[ \t]*\r?\n/.test(source.slice(bodyStart))
      if (openingLine && standalone(source, start, bodyStart)) {
        const closing = mathRange(source, /^[ \t]*\][ \t]*(?=\r?$)/gm, bodyStart)
        if (!closing) continue
        close = closing.index
        end = close + closing[0].length
      } else {
        const closing = /^(?:[^\[\]\r\n]|\[[^\[\]\r\n]*\])+\]/.exec(source.slice(bodyStart))
        if (!closing) continue
        end = bodyStart + closing[0].length
        if (!table && !standalone(source, start, end)) continue
        close = end - 1
      }
    } else {
      const lineEnd = source.indexOf('\n', start)
      const limit = Math.min(lineEnd < 0 ? source.length : lineEnd, start + 1000)
      let depth = 1
      close = bodyStart
      for (; close < limit && depth > 0; close++) {
        if (source[close - 1] === '\\') continue
        if (source[close] === '(') depth++
        if (source[close] === ')') depth--
      }
      if (depth > 0) continue
      end = close
      close--
    }

    // A candidate must not consume a real code span, link, or existing math.
    if (protectedRange && protectedRange[0] < end) continue
    const tex = source.slice(bodyStart, close).trim()
    if (table && source.slice(start, end).includes('\n')) continue
    const variable = /^[a-zA-Z]$/.test(tex) && /(?:变量|未知数|参数|记作|设|含有)[^。！？\n]{0,20}$/.test(source.slice(Math.max(0, start - 28), start))
    const mathLike = /\\[a-zA-Z]+|[=<>^_≤≥≠]|[a-zA-Z0-9]\s*[+*/-]\s*[a-zA-Z0-9]/.test(tex)
      && !/[\p{Script=Han}]/u.test(tex)
    if (!tex || (!explicit && !variable && !mathLike)) continue
    if (!isBracket && !explicit && /^(?:选项|答案|步骤|第)\s*$/.test(source.slice(Math.max(0, start - 5), start))) continue
    const display = isBracket && !table && standalone(source, start, end)
    const prepared = table
      ? tex.replace(/(?<!\\)\|/g, '\\vert ').replace(/\\\|/g, '\\vert ')
      : tex
    const flat = prepared.replace(/\r?\n\s*/g, ' ')
    const replacement = display ? blockMath(prepared) : '$' + flat + '$'
    const original = source.slice(start, end)
    const line = lineNumber(source, start)
    if (explicit) {
      normalized.push({ start, end, replacement })
    } else {
      const error = formulaError(prepared, display)
      suggestions.push({
        start, end, replacement, original, line,
        reason: error ? '疑似公式，需修正 LaTeX 后再应用。' : variable
          ? '上下文提到未知数或变量，可能需要数学排版。'
          : display ? '独占一段，且含数学符号或 LaTeX 命令。' : '括号内含数学符号或 LaTeX 命令。',
      })
    }
    opens.lastIndex = end
  }
  return { normalized, suggestions, diagnostics, formulas, imageFallbacks }
}

const blockMath = (tex: string) => '$$\n' + tex + '\n$$'

function standalone(source: string, start: number, end: number) {
  const before = source.lastIndexOf('\n', start - 1) + 1
  const after = source.indexOf('\n', end)
  return !source.slice(before, start).trim() && !source.slice(end, after === -1 ? undefined : after).trim()
}

function formulaError(tex: string, displayMode: boolean) {
  try {
    katex.renderToString(tex, { displayMode, strict: 'ignore' })
    return null
  } catch (error) {
    return error instanceof Error ? error.message.replace(/^KaTeX parse error:\s*/, '') : '无法解析该公式。'
  }
}

function literal(text: string) {
  return Array.from(text, (character) => /[!-/:-@[-`{-~]/.test(character) ? '\\' + character : character).join('')
}

export function whitespaceEdits(source: string): Edit[] {
  const tree = parser.parse(source)
  const edits: Edit[] = []
  // Keep code, Markdown hard breaks and internal table spacing intact.
  const first = tree.children[0]?.position?.start.offset
  const last = tree.children.at(-1)?.position?.end.offset
  if (first === undefined || last === undefined) return [{ start: 0, end: source.length, replacement: '' }]
  const leading = source.slice(0, first).match(/^(?:[ \t]*\r?\n)+/)
  if (leading) edits.push({ start: 0, end: leading[0].length, replacement: '' })
  if (last < source.length && /^(?:[ \t]*\r?\n){2,}[ \t]*$/.test(source.slice(last))) {
    edits.push({ start: last, end: source.length, replacement: '\n' })
  }
  return edits
}

export function offsetBeforeEdits(offset: number, edits: Edit[]) {
  let shift = 0
  for (const edit of edits.toSorted((a, b) => a.start - b.start)) {
    const start = edit.start + shift
    if (offset < start) break
    if (offset < start + edit.replacement.length) return edit.start
    shift += edit.replacement.length - (edit.end - edit.start)
  }
  return offset - shift
}

export function isEmbeddedImage(url: string) {
  return /^data:image\/(?:png|jpeg|gif|webp);base64,[\da-z+/=]+$/i.test(url)
}
