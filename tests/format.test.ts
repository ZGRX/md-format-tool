import assert from 'node:assert/strict'
import test from 'node:test'
import { analyze, applyEdits, offsetBeforeEdits, whitespaceEdits } from '../src/format.ts'
import { sample } from '../src/sample.ts'

test('the linear system sample repairs all eight formulas and round-trips', () => {
  const initial = analyze(sample)
  assert.equal(initial.suggestions.length, 8)
  assert.equal(initial.suggestions[0].original, '(n)')
  const rendered = applyEdits(sample, initial.suggestions)
  const result = analyze(rendered)
  assert.equal(result.formulas.length, 8)
  assert.equal(result.formulas.filter((formula) => formula.display).length, 4)
  assert.equal(result.formulas.filter((formula) => formula.tex.startsWith('\\boxed')).length, 3)
  assert.equal(result.suggestions.length, 0)
  assert.deepEqual(result.diagnostics, [])
  assert.equal(applyEdits(rendered, result.normalized), rendered)
})

test('protected Markdown and ordinary numbering are preserved', () => {
  const source = String.raw`选项 (A)，第 (1) 步，变量 (n)。[x = 2](https://example.com/a) [^x]

~~~tex
\(x=1\)
[(a=2)]
~~~

已有 $x^2$，行内代码 ` + '`(a=2)`' + String.raw`。

[^x]: 脚注内容。`
  const result = analyze(source)
  assert.deepEqual(result.suggestions.map((item) => item.original), ['(n)'])
  assert.equal(result.formulas.length, 1)
  assert.deepEqual(result.normalized, [])
})

test('canonical delimiters, editable matrices, and ambiguous brackets', () => {
  const source = [
    String.raw`文字 \(x^2\)`,
    '',
    String.raw`\[ \begin{bmatrix}a & b \\ c & d\end{bmatrix} \]`,
    '',
    '$$y = 2$$',
    '',
    '[x = 3]',
  ].join('\n')
  const edits = analyze(source)
  assert.equal(edits.normalized.length, 3)
  assert.equal(edits.suggestions.length, 1)
  const result = analyze(applyEdits(source, [...edits.normalized, ...edits.suggestions]))
  assert.deepEqual(result.diagnostics, [])
  assert.equal(result.formulas.filter((entry) => entry.display).length, 3)
})

test('a pipe inside dollar math does not add a column to a GFM table', () => {
  const source = '| 公式 | 含义 |\n| --- | --- |\n| $[A | b]$ | 增广矩阵 |'
  const initial = analyze(source)
  assert.equal(initial.normalized.length, 1)
  const output = applyEdits(source, initial.normalized)
  assert.match(output, /\$\[A \\vert\s+b\]\$ \| 增广矩阵 \|/)
  assert.equal(analyze(output).formulas.length, 1)
  assert.equal(analyze(output).normalized.length, 0)
})

test('formula closing delimiters respect the number of preceding backslashes', () => {
  const source = String.raw`公式 \(x \\) + y\)。`
  const { normalized } = analyze(source, { obsidian: true })
  assert.equal(applyEdits(source, normalized), String.raw`公式 $x \\) + y$。`)
  assert.deepEqual(analyze(String.raw`公式 \\\(x=1\\\)。`, { obsidian: true }).normalized, [])
})

test('malformed formulas and missing images have source locations', () => {
  const result = analyze(String.raw`# 笔记
公式 $\frac{1$。
![图](./example.png)
\(x=1`)
  assert.deepEqual(result.diagnostics.map((item) => item.line), [2, 3, 4])
  assert.equal(result.imageFallbacks[0].replacement, '【图片 · 图】')
  assert.ok(result.diagnostics[0].formula)
})

test('cleanup preserves hard breaks and indentation and maps offsets', () => {
  const source = '\n\n    code\n\n第一行  \n第二行\n\n'
  const edits = whitespaceEdits(source)
  const output = applyEdits(source, edits)
  assert.equal(output, '    code\n\n第一行  \n第二行\n')
  assert.equal(offsetBeforeEdits(output.indexOf('第二行'), edits), source.indexOf('第二行'))
})

test('Obsidian repairs keep properties, wikilinks, embeds, and comments intact', () => {
  const source = String.raw`---
title: "(x=1)"
---

[[Note (x=2)|Alias (x=3)]]
![[Diagram (x=4).png]]
%% Comment (x=5) and \(x=6\) %%
` + '`%%`' + String.raw` (x=7)

公式 \(x=8\)。`
  const result = analyze(source, { obsidian: true })
  assert.deepEqual(result.suggestions.map((item) => item.original), ['(x=7)'])
  assert.deepEqual(result.normalized.map((item) => item.replacement), ['$x=8$'])
})

test('Obsidian paste repairs clear math without requiring confirmation', async () => {
  const { canFormatAtSelection, fitDisplayMath, formatPastedMarkdown } = await import('../obsidian/paste.ts')
  const source = String.raw`变量 (n)，选项 (A)，(well-known)，公式 \(x=1\) 和 (y=2)。`
  assert.equal(formatPastedMarkdown(source, ''), '变量 (n)，选项 (A)，(well-known)，公式 $x=1$ 和 $y=2$。')
  assert.equal(formatPastedMarkdown(String.raw`\(\frac{1\)`, ''), null)
  assert.equal(formatPastedMarkdown('正常段落和已有 $x=1$。', ''), null)
  assert.equal(formatPastedMarkdown(String.raw`[[链接 (x=1)]] 和 ` + '`(y=2)`', ''), null)
  const note = '~~~text\nexample\n~~~\n\n正文'
  assert.equal(canFormatAtSelection(note, note.indexOf('example'), note.indexOf('example')), false)
  assert.equal(canFormatAtSelection(note, note.length, note.length), true)
  assert.equal(fitDisplayMath('$$\nx=1\n$$', '开头', '结尾'), '\n\n$$\nx=1\n$$\n\n')
})

test('Obsidian repairs escaped rich-text math and preserves matrix rows', async () => {
  const { formatPastedMarkdown } = await import('../obsidian/paste.ts')
  const escaped = [
    '## 二次型',
    String.raw`- \\(x\\)：向量。`,
    '',
    String.raw`\\[ \underbrace{\begin{pmatrix}2&2\\\ 2&3\end{pmatrix}}\_{B} \\]`,
    '',
    String.raw`\\[ f$x_1,x_2,\cdots,x_n$=x^TBx \\]`,
  ].join('\n')
  const expected = [
    '## 二次型', '- $x$：向量。', '', '$$',
    String.raw`\underbrace{\begin{pmatrix}2&2\\ 2&3\end{pmatrix}}_{B}`,
    '$$', '', '$$', String.raw`f(x_1,x_2,\cdots,x_n)=x^TBx`, '$$',
  ].join('\n')
  assert.equal(formatPastedMarkdown(escaped, ''), expected)
  assert.equal(formatPastedMarkdown('Copied rich text', '<h2>二次型</h2>', escaped), expected)
  assert.equal(formatPastedMarkdown('Copied rich text', String.raw`<h2>二次型</h2><p>\(x\)</p>`, '', () => escaped), expected)
  assert.equal(formatPastedMarkdown('正常文字', '<h2>Heading</h2>', '', () => { throw Error('Native paste should handle this') }), null)
})
