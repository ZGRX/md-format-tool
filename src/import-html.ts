import { defaultTreeAdapter, parseFragment } from 'parse5'
import type { DefaultTreeAdapterTypes } from 'parse5'
import TurndownService from 'turndown'
// @ts-expect-error The GFM extension has no type declarations.
import { gfm as untypedGfm } from 'turndown-plugin-gfm'
import { escapeTableMathPipes, isEmbeddedImage } from './format.ts'

const gfm = untypedGfm as TurndownService.Plugin
const elementNames = new Set([
  'a', 'address', 'article', 'aside', 'annotation', 'b', 'blockquote', 'br',
  'caption', 'code', 'dd', 'del', 'details', 'div', 'dl', 'dt', 'em', 'figcaption', 'figure', 'footer',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'i', 'img', 'input',
  'li', 'main', 'math', 'nav', 'ol', 'p', 'pre', 's', 'section', 'span', 'strike',
  'strong', 'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'th', 'thead', 'tfoot', 'tr', 'ul',
])
const droppedElements = new Set([
  'button', 'embed', 'form', 'head', 'iframe', 'link', 'meta', 'noscript', 'object', 'style', 'template',
])
const textAttributes = new Set([
  'alt', 'checked', 'class', 'data-latex', 'data-tex', 'display', 'encoding', 'start', 'title', 'type',
])

function safeAddress(address: string, tag: string) {
  try {
    const protocol = new URL(address, 'https://clipboard.invalid/').protocol
    if (protocol === 'data:') return tag === 'img' && isEmbeddedImage(address)
    return !['javascript:', 'vbscript:', 'file:'].includes(protocol)
  } catch {
    return false
  }
}

function appendClipboardNodes(parent: HTMLElement, nodes: DefaultTreeAdapterTypes.ChildNode[]) {
  const doc = parent.ownerDocument
  for (const node of nodes) {
    if (defaultTreeAdapter.isTextNode(node)) {
      parent.append(doc.createTextNode(node.value))
      continue
    }
    if (!defaultTreeAdapter.isElementNode(node) || droppedElements.has(node.tagName)) continue

    if (node.tagName === 'script') {
      const type = node.attrs.find(({ name }) => name === 'type')?.value
      if (type?.startsWith('math/tex')) {
        const formula = doc.createElement('span')
        formula.setAttribute('data-tex', node.childNodes.filter(defaultTreeAdapter.isTextNode).map((text) => text.value).join(''))
        if (type.includes('mode=display')) formula.setAttribute('display', 'block')
        parent.append(formula)
      }
      continue
    }

    const element = doc.createElement(elementNames.has(node.tagName) ? node.tagName : 'span')
    if (node.tagName === 'mjx-container') element.setAttribute('data-md-math-container', '')
    for (const { name, value, namespace } of node.attrs) {
      if (namespace) continue
      const isAddress = (node.tagName === 'a' && name === 'href') || (node.tagName === 'img' && name === 'src')
      if (textAttributes.has(name) || (isAddress && safeAddress(value, node.tagName))) {
        element.setAttribute(name, value)
      }
    }
    appendClipboardNodes(element, node.childNodes)
    parent.append(element)
  }
}

export function importHtml(html: string) {
  // Parse to a data tree first, then build only the nodes Turndown needs.
  // Keep those nodes in a detached document throughout conversion.
  const inertDocument = document.implementation.createHTMLDocument('')
  const root = inertDocument.createElement('div')
  appendClipboardNodes(root, parseFragment(html, { scriptingEnabled: false }).childNodes)
  const converter = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' })
  converter.use(gfm)
  converter.addRule('cellBreak', {
    filter: (node) => node.nodeName === 'BR' && Boolean(node.closest('td,th')),
    replacement: () => ' ',
  })

  const formulas: Array<{ token: string; markdown: string }> = []
  let prefix = 'MDMATHTOKEN'
  while (html.includes(prefix)) prefix += 'X'
  const selector = '.katex-display, .katex, math, [data-md-math-container], [data-latex], [data-tex]'
  for (const node of root.querySelectorAll(selector)) {
    if (!root.contains(node) || node.closest('pre, code')) continue
    const annotation = node.querySelector('annotation[encoding="application/x-tex"], annotation[encoding="application/x-latex"]')
    const tex = (node.getAttribute('data-latex') || node.getAttribute('data-tex') || annotation?.textContent)?.trim()
    if (!tex) continue
    const display = !node.closest('td,th') && (node.classList.contains('katex-display')
      || node.matches('[display="block"],[display="true"],.math-display')
      || Boolean(node.querySelector('math[display="block"]')))
    const formula = node.closest('td,th') ? escapeTableMathPipes(tex) : tex
    const token = prefix + formulas.length + 'END'
    const placeholder = inertDocument.createElement(display ? 'div' : 'span')
    placeholder.textContent = token
    node.replaceWith(placeholder)
    formulas.push({
      token,
      markdown: display ? '$$\n' + formula + '\n$$' : '$' + formula.replace(/\s*\n\s*/g, ' ') + '$',
    })
  }
  root.querySelectorAll('table').forEach((table) => {
    if (table.rows.length && !table.rows[0].querySelector('th')) {
      for (const cell of Array.from(table.rows[0].cells)) {
        const header = inertDocument.createElement('th')
        header.append(...cell.childNodes)
        cell.replaceWith(header)
      }
    }
  })
  let markdown = converter.turndown(root)
  for (const { token, markdown: formula } of formulas) markdown = markdown.replace(token, () => formula)
  return markdown
}

export function fromClipboard(text: string, html: string) {
  // Prefer Markdown when the source provides actual Markdown syntax as text,
  // unless the HTML carries a richer structure or recoverable formula source.
  const structuredHtml = /<(?:h[1-6]|strong|b|em|i|ul|ol|blockquote|table|pre|img|math|mjx-container|a\s)\b|katex|data-(?:latex|tex)=/i
  const markdown = /^(?:#{1,6}\s|\s*```|\s*\|.*\|\s*$)|\*\*|\\[[(]|\$\$/m
  const useHtml = html && (structuredHtml.test(html) || !text) && (!markdown.test(text) || /annotation|data-(?:latex|tex)=|<table\b/i.test(html))
  return {
    source: useHtml ? importHtml(html) || text : text,
    kind: useHtml ? '网页剪贴板' : '剪贴板',
    original: useHtml ? html : text,
  }
}
