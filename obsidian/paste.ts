import { analyze, applyEdits } from '../src/format.ts'
import { importHtml } from '../src/import-html.ts'

export function formatPastedMarkdown(
  text: string,
  html: string,
  clipboardMarkdown = '',
  convertHtml?: (html: string) => string,
) {
  const options = { obsidian: true }
  const internalCopy = text && html.includes('<!-- obsidian -->')
  const original = internalCopy ? text : clipboardMarkdown || text
  let source = original
  let analysis = analyze(original, options)

  if (html && !internalCopy && !clipboardMarkdown) {
    const hasAnnotations = /<annotation\b|data-(?:latex|tex)=|<script\b[^>]*math\/tex/i.test(html)
    const hasDelimiters = analysis.normalized.length || /\\[[(]|&#(?:92|x5c);/i.test(html)
    const recovered = hasAnnotations ? importHtml(html) : hasDelimiters ? convertHtml?.(html) : undefined
    if (recovered && recovered !== original) {
      const rich = analyze(recovered, options)
      const found = rich.formulas.length + rich.normalized.length
      const originalCount = analysis.formulas.length + analysis.normalized.length
      if ((rich.normalized.length || (hasAnnotations && rich.formulas.length))
        && found >= originalCount && !rich.diagnostics.some((item) => item.formula)) {
        source = recovered
        analysis = rich
      }
    }
  }

  const normalized = analysis.normalized.filter((edit) =>
    !analyze(edit.replacement, options).diagnostics.some((item) => item.formula))
  const approved = analysis.suggestions.filter((item) => item.autoApply)
  const result = applyEdits(source, [...normalized, ...approved])
  return result !== original ? result : null
}

export function canFormatAtSelection(note: string, from: number, to: number) {
  if (!note) return true
  return !analyze(note, { obsidian: true }).protectedRanges.some(([start, end]) =>
    from === to ? start < from && from <= end : from < end && start < to && !(from <= start && to >= end))
}

export function fitDisplayMath(markdown: string, before: string, after: string) {
  const firstLine = before.slice(before.lastIndexOf('\n') + 1)
  const lastLine = after.split('\n', 1)[0]
  if (firstLine.trim() && /^\s*\$\$[ \t]*\r?\n/.test(markdown)) markdown = '\n\n' + markdown
  if (lastLine.trim() && /\r?\n[ \t]*\$\$[ \t]*$/.test(markdown)) markdown += '\n\n'
  return markdown
}
