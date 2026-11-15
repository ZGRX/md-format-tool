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
