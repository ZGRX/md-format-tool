import { mathjax } from 'mathjax-full/js/mathjax.js'
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js'
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js'
import { MathML } from 'mathjax-full/js/input/mathml.js'
import { SVG } from 'mathjax-full/js/output/svg.js'

const adaptor = liteAdaptor()
RegisterHTMLHandler(adaptor)
const renderer = mathjax.document('', {
  InputJax: new MathML(),
  OutputJax: new SVG({ fontCache: 'none' }),
})

export function captureMath(math: Element) {
  const display = math.getAttribute('display') === 'block'
  const container = renderer.convert(new XMLSerializer().serializeToString(math), {
    display,
    em: 16,
    ex: 8,
    containerWidth: 10_000,
  })
  const svg = adaptor.tags(container, 'svg')[0]
  adaptor.setAttribute(svg, 'xmlns', 'http://www.w3.org/2000/svg')
  const baseline = /vertical-align:\s*(-?[\d.]+)ex/.exec(adaptor.getAttribute(svg, 'style'))?.[1] ?? '0'
  const width = adaptor.getAttribute(svg, 'width')
  const height = adaptor.getAttribute(svg, 'height')
  adaptor.append(svg, adaptor.node('style', {}, [adaptor.text(
    '[data-frame],[data-line]{stroke-width:70;fill:none}',
  )]))
  const image = document.createElement('img')
  image.className = 'capture-formula'
  image.alt = math.querySelector('annotation')?.textContent ?? '公式'
  image.style.width = width
  image.style.height = height
  image.style.verticalAlign = baseline + 'ex'
  image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(adaptor.outerHTML(svg))
  return image
}
