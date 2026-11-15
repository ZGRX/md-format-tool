import { getLanguage, htmlToMarkdown, Modal, Notice, Plugin, Setting } from 'obsidian'
import type { App, Editor, MarkdownFileInfo } from 'obsidian'
import { analyze, applyEdits } from '../src/format.ts'
import type { Edit } from '../src/format.ts'
import { fromClipboard } from '../src/import-html.ts'
import { canFormatAtSelection, fitDisplayMath, formatPastedMarkdown } from './paste.ts'

const translations = {
  en: {
    paste: 'Paste and repair Markdown',
    repair: 'Repair selection or current note',
    pasteHint: 'Paste text or web content here, then review the formula repairs.',
    input: 'Content to paste',
    review: 'Review repairs',
    insert: 'Insert Markdown',
    apply: 'Apply repairs',
    cancel: 'Cancel',
    normalize: (count: number) => 'Standard delimiter repairs: ' + count,
    optional: 'Select the ambiguous formulas you want to repair.',
    line: (number: number) => 'Line ' + number,
    unchanged: 'No formula repairs found.',
    empty: 'Paste or enter some content first.',
    applied: 'Formula repairs applied.',
    inserted: 'Markdown inserted.',
    changed: 'The target note or selection changed. Run the command again.',
    multi: 'This command works with one selection at a time.',
  },
  zh: {
    paste: '粘贴并修复 Markdown',
    repair: '修复选区或当前笔记',
    pasteHint: '在此粘贴文本或网页内容，然后检查公式修复。',
    input: '待粘贴的内容',
    review: '检查修复',
    insert: '插入 Markdown',
    apply: '应用修复',
    cancel: '取消',
    normalize: (count: number) => '将统一 ' + count + ' 处标准公式分隔符。',
    optional: '请勾选要修复的疑似公式。',
    line: (number: number) => '第 ' + number + ' 行',
    unchanged: '没有找到可修复的公式。',
    empty: '请先粘贴或输入内容。',
    applied: '已应用公式修复。',
    inserted: '已插入 Markdown。',
    changed: '目标笔记或选区已变化，请重新运行命令。',
    multi: '请使用单个选区或光标运行此命令。',
  },
}

type Labels = typeof translations.en
type Analysis = ReturnType<typeof analyze>
type Repairs = Pick<Analysis, 'normalized' | 'suggestions'>

class PasteModal extends Modal {
  constructor(app: App, private labels: Labels, private onReview: (source: string) => void) {
    super(app)
  }

  onOpen() {
    this.modalEl.addClass('md-format-tool')
    this.setTitle(this.labels.paste)
    this.contentEl.createEl('p', { text: this.labels.pasteHint })
    const input = this.contentEl.createEl('textarea', {
      cls: 'md-format-tool-input',
      attr: { 'aria-label': this.labels.input },
    })
    input.addEventListener('paste', (event) => {
      const text = event.clipboardData?.getData('text/plain') ?? ''
      const html = event.clipboardData?.getData('text/html') ?? ''
      if (!text && !html) return
      const markdown = fromClipboard(text, html).source
      event.preventDefault()
      input.setRangeText(markdown, input.selectionStart, input.selectionEnd, 'end')
    })
    new Setting(this.contentEl).setClass('md-format-tool-actions')
      .addButton((button) => button.setButtonText(this.labels.cancel).onClick(() => this.close()))
      .addButton((button) => button.setButtonText(this.labels.review).setCta().onClick(() => {
        if (!input.value.trim()) {
          new Notice(this.labels.empty)
          return
        }
        const source = input.value
        this.close()
        this.onReview(source)
      }))
    input.focus()
  }

  onClose() {
    this.contentEl.empty()
  }
}

class RepairModal extends Modal {
  constructor(
    app: App,
    private labels: Labels,
    private repairs: Repairs,
    private submitLabel: string,
    private onApply: (edits: Edit[]) => void,
  ) {
    super(app)
  }

  onOpen() {
    this.modalEl.addClass('md-format-tool')
    this.setTitle(this.labels.review)
    const { normalized, suggestions } = this.repairs
    const selected = new Set<Edit>()
    if (normalized.length) this.contentEl.createEl('p', { text: this.labels.normalize(normalized.length) })
    if (suggestions.length) {
      this.contentEl.createEl('p', { text: this.labels.optional })
      const list = this.contentEl.createDiv({ cls: 'md-format-tool-review' })
      for (const suggestion of suggestions) {
        const diff = createFragment((fragment) => {
          fragment.createEl('code', { text: suggestion.original, cls: 'md-format-tool-before' })
          fragment.createEl('code', { text: suggestion.replacement, cls: 'md-format-tool-after' })
        })
        const label = this.labels.line(suggestion.line)
        new Setting(list).setName(label).setDesc(diff)
          .addToggle((toggle) => toggle.setTooltip(label).onChange((enabled) => {
            if (enabled) selected.add(suggestion)
            else selected.delete(suggestion)
          }))
      }
    }
    new Setting(this.contentEl).setClass('md-format-tool-actions')
      .addButton((button) => button.setButtonText(this.labels.cancel).onClick(() => this.close()))
      .addButton((button) => button.setButtonText(this.submitLabel).setCta().onClick(() => {
        this.close()
        this.onApply([...normalized, ...selected])
      }))
  }

  onClose() {
    this.contentEl.empty()
  }
}

export default class MarkdownFormatPlugin extends Plugin {
  private modal?: Modal

  onload() {
    const labels = getLanguage().startsWith('zh') ? translations.zh : translations.en
    this.registerEvent(this.app.workspace.on('editor-paste', (event, editor) => {
      const clipboard = event.clipboardData
      if (event.defaultPrevented || !clipboard || clipboard.files.length || editor.listSelections().length !== 1) return
      const text = clipboard.getData('text/plain')
      const html = clipboard.getData('text/html')
      const markdown = clipboard.getData('text/markdown')
      let formatted: string | null
      try {
        formatted = formatPastedMarkdown(text, html, markdown, htmlToMarkdown)
      } catch (error) {
        console.warn('Markdown Format Tool: paste conversion failed', error)
        return
      }
      if (formatted === null) return
      const note = editor.getValue()
      const from = editor.posToOffset(editor.getCursor('from'))
      const to = editor.posToOffset(editor.getCursor('to'))
      if (!canFormatAtSelection(note, from, to)) return
      event.preventDefault()
      editor.replaceSelection(fitDisplayMath(formatted, note.slice(0, from), note.slice(to)), 'input.paste')
    }))
    this.addCommand({
      id: 'paste-and-repair',
      name: labels.paste,
      editorCallback: (editor, context) => {
        const target = this.captureTarget(editor, context, labels)
        if (!target) return
        this.openModal(new PasteModal(this.app, labels, (source) => {
          const repairs = analyze(source, { obsidian: true })
          const insert = (edits: Edit[]) => {
            if (!target.isCurrent()) return
            const content = applyEdits(source, edits)
            editor.replaceRange(content, editor.offsetToPos(target.from), editor.offsetToPos(target.to))
            editor.setCursor(editor.offsetToPos(target.from + content.length))
            new Notice(labels.inserted)
          }
          if (repairs.normalized.length || repairs.suggestions.length) {
            this.openModal(new RepairModal(this.app, labels, repairs, labels.insert, insert))
          } else {
            insert([])
          }
        }))
      },
    })
    this.addCommand({
      id: 'repair-note',
      name: labels.repair,
      editorCallback: (editor, context) => {
        const target = this.captureTarget(editor, context, labels)
        if (!target) return
        const within = (edit: Edit) => target.from === target.to || (edit.start >= target.from && edit.end <= target.to)
        const analysis = analyze(target.source, { obsidian: true })
        const repairs = {
          normalized: analysis.normalized.filter(within),
          suggestions: analysis.suggestions.filter(within),
        }
        if (!repairs.normalized.length && !repairs.suggestions.length) {
          new Notice(labels.unchanged)
          return
        }
        this.openModal(new RepairModal(this.app, labels, repairs, labels.apply, (edits) => {
          if (!edits.length || !target.isCurrent()) return
          editor.transaction({
            changes: [...edits].sort((a, b) => a.start - b.start).map((edit) => ({
              from: editor.offsetToPos(edit.start),
              to: editor.offsetToPos(edit.end),
              text: edit.replacement,
            })),
          })
          new Notice(labels.applied)
        }))
      },
    })
  }

  onunload() {
    this.modal?.close()
  }

  private openModal(modal: Modal) {
    this.modal?.close()
    this.modal = modal
    modal.open()
  }

  private captureTarget(editor: Editor, context: MarkdownFileInfo, labels: Labels) {
    if (editor.listSelections().length !== 1) {
      new Notice(labels.multi)
      return
    }
    const file = context.file
    const source = editor.getValue()
    const from = editor.posToOffset(editor.getCursor('from'))
    const to = editor.posToOffset(editor.getCursor('to'))
    const isCurrent = () => {
      const active = this.app.workspace.activeEditor
      if (active?.editor === editor && active.file === file && editor.getValue() === source
        && editor.listSelections().length === 1 && editor.posToOffset(editor.getCursor('from')) === from
        && editor.posToOffset(editor.getCursor('to')) === to) return true
      new Notice(labels.changed)
      return false
    }
    return { source, from, to, isCurrent }
  }
}
