import TurndownService from 'turndown'
// @ts-expect-error The GFM extension has no type declarations.
import { gfm } from 'turndown-plugin-gfm'
import { escapeTableMathPipes } from './format.ts'

export function importHtml(html: string) {
  // Parse and convert in the template's inert document. No clipboard nodes
  // are inserted into the editor or the live web page.
  const template = document.createElement('template')
  const inertDocument = template.content.ownerDocument!
  const wrapper = inertDocument.createElement('div')
  const range = inertDocument.createRange()
  range.selectNodeContents(wrapper)
  const root = range.createContextualFragment(html)
  root.querySelectorAll('script:not([type^="math/tex"]), style, template, noscript, head, meta, link, form, button')
    .forEach((node) => node.remove())
  const converter = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' })
  converter.use(gfm)
  converter.addRule('cellBreak', {
    filter: (node) => node.nodeName === 'BR' && Boolean(node.closest('td,th')),
    replacement: () => ' ',
  })

  const formulas: Array<{ token: string; markdown: string }> = []
  let prefix = 'MDMATHTOKEN'
  while (html.includes(prefix)) prefix += 'X'
  const selector = '.katex-display, .katex, mjx-container, math, [data-latex], [data-tex], script[type^="math/tex"]'
  for (const node of root.querySelectorAll(selector)) {
    if (!root.contains(node) || node.closest('pre, code')) continue
    const annotation = node.querySelector('annotation[encoding="application/x-tex"], annotation[encoding="application/x-latex"]')
    const tex = (node.getAttribute('data-latex') || node.getAttribute('data-tex') || annotation?.textContent
      || (node.tagName === 'SCRIPT' ? node.textContent : ''))?.trim()
    if (!tex) continue
    const display = !node.closest('td,th') && (node.classList.contains('katex-display')
      || node.matches('[display="block"],[display="true"],.math-display,script[type*="mode=display"]')
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
  root.querySelectorAll('script').forEach((node) => node.remove())

  // Links and images are copied as addresses. Discard active URL schemes.
  root.querySelectorAll('[href], [src]').forEach((node) => {
    for (const attribute of ['href', 'src']) {
      const address = node.getAttribute(attribute)
      if (address && /^(?:javascript|vbscript|file):/i.test(address.replace(/[\t\n\r]/g, '').trimStart())) {
        node.removeAttribute(attribute)
      }
    }
  })
  root.querySelectorAll('table').forEach((table) => {
    if (table.rows.length && !table.rows[0].querySelector('th')) {
      for (const cell of Array.from(table.rows[0].cells)) {
        const header = inertDocument.createElement('th')
        header.append(...cell.childNodes)
        cell.replaceWith(header)
      }
    }
  })
  wrapper.append(root)
  let markdown = converter.turndown(wrapper)
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
