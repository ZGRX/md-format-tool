import katex from 'katex'
import { analyze, applyEdits } from './format.ts'

const PAGE_HEIGHT = 860
const PAGE_PADDING = 32
export type ImageLayout = 'standard' | 'compact' | 'wide'

export function download(data: Blob, filename: string) {
  const url = URL.createObjectURL(data)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

export async function copyText(text: string) {
  await navigator.clipboard.writeText(text)
}

export function chatText(article: HTMLElement) {
  const clone = article.cloneNode(true) as HTMLElement
  clone.querySelectorAll('.katex').forEach((formula) => {
    formula.replaceWith(document.createTextNode(formula.querySelector('annotation')?.textContent ?? formula.textContent ?? ''))
  })
  clone.querySelectorAll('img').forEach((image) => image.replaceWith(document.createTextNode(image.alt || '图片')))
  clone.querySelectorAll('tr').forEach((row) => row.replaceWith(
    document.createTextNode(Array.from(row.cells, (cell) => cell.textContent?.trim()).join(' ｜ ') + '\n'),
  ))
  clone.querySelectorAll('li').forEach((item) => {
    const list = item.parentElement
    const prefix = list instanceof HTMLOListElement ? (list.start + Array.from(list.children).indexOf(item)) + '. ' : '• '
    const first = item.firstElementChild?.tagName === 'P' ? item.firstElementChild : item
    first.prepend(prefix)
  })
  const stage = makeStage()
  try {
    stage.append(clone)
    return clone.innerText.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim()
  } finally {
    stage.remove()
  }
}

function makeStage() {
  const stage = document.createElement('div')
  stage.className = 'export-stage'
  stage.setAttribute('aria-hidden', 'true')
  document.body.append(stage)
  return stage
}

function newPage(width: number) {
  const page = document.createElement('article')
  page.className = 'note capture-page'
  page.style.width = width + 'px'
  return page
}

function fitBlock(element: HTMLElement, pageWidth: number) {
  const contentWidth = pageWidth - PAGE_PADDING * 2
  const contentHeight = PAGE_HEIGHT - PAGE_PADDING * 2
  const wrapper = document.createElement('div')
  wrapper.className = 'capture-block'
  wrapper.append(element)

  function fit() {
    const area = element.getBoundingClientRect()
    const overflowing = Math.max(element.scrollWidth, ...Array.from(
      element.querySelectorAll<HTMLElement>('.table-scroll, .katex-display, td, th, code, .katex'),
      (node) => node.getBoundingClientRect().left - area.left + node.scrollWidth,
    ))
    const widthScale = contentWidth / Math.max(contentWidth, overflowing)
    const scale = Math.min(1, widthScale, (contentHeight - 20) / Math.max(1, area.height))
    if (scale < 1) {
      element.style.transformOrigin = 'top left'
      element.style.transform = 'scale(' + scale + ')'
      wrapper.style.height = area.height * scale + 'px'
    }
  }

  return { wrapper, fit }
}

function* splitBlock(element: HTMLElement, rowsPerPage: number) {
  const table = element.querySelector('table')
  if (table && table.tBodies.length === 1 && table.tBodies[0].rows.length > rowsPerPage) {
    const rows = Array.from(table.tBodies[0].rows)
    for (let offset = 0; offset < rows.length; offset += rowsPerPage) {
      const clone = element.cloneNode(true) as HTMLElement
      clone.querySelector('tbody')!.replaceChildren(...rows.slice(offset, offset + rowsPerPage)
        .map((row) => row.cloneNode(true)))
      yield clone
    }
  } else if (element.matches('ul,ol') && element.children.length > 1) {
    for (const [index, item] of Array.from(element.children).entries()) {
      const list = element.cloneNode(false) as HTMLOListElement | HTMLUListElement
      if (list instanceof HTMLOListElement) list.start = (element as HTMLOListElement).start + index
      list.append(item.cloneNode(true))
      yield list
    }
  } else {
    yield element.cloneNode(true) as HTMLElement
  }
}

export async function exportImages(article: HTMLElement, filename: string, layout: ImageLayout) {
  const stage = makeStage()
  const width = layout === 'wide' ? 720 : 520
  const capture = article.cloneNode(true) as HTMLElement
  try {
    const [{ toBlob }, { captureMath }] = await Promise.all([
      import('html-to-image'), import('./capture-math.ts'), document.fonts.ready,
    ])
    for (const formula of capture.querySelectorAll('.katex')) {
      const math = formula.querySelector('math')
      if (math) formula.replaceWith(captureMath(math))
    }
    await Promise.all(Array.from(capture.querySelectorAll('img'), (image) => image.decode()))
    const pages = [newPage(width)]
    stage.append(pages[0])
    for (const child of Array.from(capture.children) as HTMLElement[]) {
      for (const element of splitBlock(child, layout === 'compact' ? 7 : 10)) {
        let page = pages.at(-1)!
        const { wrapper, fit } = fitBlock(element, width)
        page.append(wrapper)
        fit()
        if (page.offsetHeight > PAGE_HEIGHT && page.children.length > 1) {
          page = newPage(width)
          pages.push(page)
          stage.append(page)
          page.append(wrapper)
        }
      }
    }
    const images: Blob[] = []
    for (const page of pages) {
      const blob = await toBlob(page, { pixelRatio: 2, backgroundColor: '#ffffff', skipFonts: true })
      if (!blob) throw new Error('无法生成图片，请尝试缩短内容后重试。')
      images.push(blob)
    }
    if (images.length === 1) {
      download(images[0], filename + '.png')
    } else {
      const { default: JSZip } = await import('jszip')
      const zip = new JSZip()
      for (const [index, blob] of images.entries()) {
        zip.file(filename + '-' + String(index + 1).padStart(2, '0') + '.png', blob)
      }
      download(await zip.generateAsync({ type: 'blob' }), filename + '-微信图片.zip')
    }
    return images.length
  } finally {
    stage.remove()
  }
}

export type WordMode = 'editable' | 'image' | 'literal'

async function wordSource(source: string, mode: WordMode) {
  const { formulas, diagnostics, imageFallbacks } = analyze(source)
  if (mode === 'editable') return applyEdits(source, imageFallbacks)
  if (mode === 'literal') {
    return applyEdits(source, [...imageFallbacks, ...diagnostics.flatMap((item) => item.formula ? [item.formula] : [])])
  }
  const stage = makeStage()
  try {
    const [{ toPng }, { captureMath }] = await Promise.all([
      import('html-to-image'), import('./capture-math.ts'), document.fonts.ready,
    ])
    const edits = [...imageFallbacks]
    for (const formula of formulas) {
      const node = document.createElement('div')
      node.className = 'word-formula-capture'
      try {
        katex.render(formula.tex, node, { displayMode: formula.display, strict: 'ignore', output: 'mathml' })
        const image = captureMath(node.querySelector('math')!)
        node.replaceChildren(image)
        await image.decode()
      } catch {
        throw new Error('第 ' + formula.line + ' 行公式无法生成图片，请修正 LaTeX 或选择保留源码。')
      }
      stage.replaceChildren(node)
      const image = await toPng(node, { pixelRatio: 1.5, skipFonts: true })
      const markup = '![公式](' + image + ')'
      edits.push({ ...formula, replacement: formula.display ? '\n\n' + markup + '\n\n' : markup })
    }
    return applyEdits(source, edits)
  } finally {
    stage.remove()
  }
}

export async function exportWord(source: string, filename: string, mode: WordMode) {
  const prepared = await wordSource(source, mode)
  const res = await fetch('/api/word', {
    method: 'POST',
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
    body: prepared,
  })
  if (!res.ok) {
    const detail = (await res.json().catch(() => null))?.error || 'Word 转换接口不可用。'
    const match = /Could not convert TeX math ([\s\S]*?), rendering as/i.exec(detail)
    const formulas = analyze(source).formulas
    const formula = match && formulas.find((entry) => entry.tex === match[1] || match[1].includes(entry.tex))
    throw new Error((formula ? '第 ' + formula.line + ' 行公式，' : '') + detail)
  }
  download(await res.blob(), filename + '.docx')
}
