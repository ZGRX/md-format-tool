import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { visit } from 'unist-util-visit'
import type { Root } from 'mdast'
import { isEmbeddedImage } from './format.ts'

export function Preview({ source }: { source: string }) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm, remarkMath, importLineBreaks]}
      remarkRehypeOptions={{ footnoteLabel: '脚注', footnoteBackLabel: '返回正文' }}
      rehypePlugins={[[rehypeKatex, { strict: 'ignore' }]]}
      skipHtml
      urlTransform={(url, key) => {
        if (key === 'src') return isEmbeddedImage(url) ? url : ''
        return /^(?:https?:|mailto:|[#/])|^[^:]+$/i.test(url) && !url.startsWith('//') ? url : ''
      }}
      components={{
        a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
        img: ({ node: _node, src, alt }) => src
          ? <img src={src} alt={alt ?? ''} />
          : <span className="image-placeholder">图片 · {alt || '未加载的资源'}</span>,
        table: ({ node: _node, ...props }) => <div className="table-scroll"><table {...props} /></div>,
      }}
    >{source}</Markdown>
  )
}

function importLineBreaks() {
  return (tree: Root) => {
    visit(tree, 'html', (node, index, parent) => {
      if (parent && index !== undefined && /^<br\s*\/?>$/i.test(node.value)) parent.children[index] = { type: 'break' }
    })
  }
}
