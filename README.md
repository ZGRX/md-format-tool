# Markdown Format Tool

English · [简体中文](README.zh-CN.md)

The Obsidian plugin repairs LaTeX formulas as you paste into a note. The companion web app formats AI-generated content on your machine. Paste plain text, Markdown, or structured content from a web page, or import a single `.md` file. Review suggested formula repairs alongside the source and export the result for WeChat, Word, or Obsidian.

## Getting started

Use a Node.js version that meets [Vite's requirements](https://vite.dev/guide/). Word export requires [Pandoc](https://pandoc.org/installing.html). The app looks for Pandoc in your PATH, in `.tools/pandoc-*/bin/pandoc`, or at the path set in `PANDOC_PATH`.

```sh
npm ci
npm run dev
```

Open the local address shown in your terminal, usually [http://127.0.0.1:5173/](http://127.0.0.1:5173/). Run `npm test` to check format detection and round-trip conversion. Use `npm run build` to build the app and `npm run preview` to try the build. Word export in the preview also uses your local Pandoc installation.

## What you can do

- **Review and repair formulas.** The built-in linear algebra example has seven repairs selected, with the variable `(n)` left for you to review. For new imports, select the suggested repairs for ambiguous parentheses and brackets. The app automatically standardizes recognized LaTeX delimiters. You can inspect the original text or HTML and restore the imported content.
- **Share to WeChat.** Copy paragraphs, lists, and tables as chat text, or download PNGs at 1040 px or 1440 px wide. Multiple pages are bundled in a ZIP. Long tables split across pages and repeat their headers. Extra-wide content scales to fit.
- **Export to Word.** DOCX files use Word heading styles, native tables, and editable OMML equations by default. You can export equations as images or keep the LaTeX source where KaTeX reports an error. The browser sends the content to Pandoc through a local HTTP endpoint and downloads the generated file.
- **Export Markdown.** Preview the rendered note or its source, then copy or download it. Exports use dollar-sign math delimiters and Markdown table syntax supported by Obsidian.

## Obsidian plugin

Download `md-format-tool-0.2.1.zip` from the [GitHub release](https://github.com/ZGRX/md-format-tool/releases/tag/0.2.1) or build it with `npm ci` and `npm run build:obsidian`. Unzip it into `.obsidian/plugins/` inside your vault, then enable **Markdown Format Tool** under **Settings → Community plugins**. The plugin requires Obsidian 1.8.7 or later. [Obsidian manual installation guide](https://github.com/obsidianmd/obsidian-sample-plugin#manually-installing-the-plugin)

Paste directly into an open note with **⌘V** or **Ctrl+V**. The plugin converts recognizable formulas to Obsidian math syntax. Use the command palette if you want to review ambiguous formulas.

- **Paste and repair Markdown** opens a paste box and lets you review repairs before inserting content at the cursor or replacing a selection.
- **Repair selection or current note** checks the selection, or the current note if there is no selection. It shows ambiguous formulas before you choose which ones to repair.

The command labels follow Obsidian's language setting for English and Chinese, and all conversion runs locally.

## Current limitations

- Recovering formulas from pasted HTML requires LaTeX annotations or `data-latex` or `data-tex` attributes in the clipboard content. Complex embeds and attachment folders have limited support. The preview and image exports render supported embedded raster images. Other images appear as placeholders, and Markdown exports keep their original URLs.
- The browser's Word preview shows content and structure. Word determines the final pagination. The sample DOCX has been checked for eight OMML equations, three boxed formulas, and a native table. Microsoft Word, WPS, Obsidian, and WeChat on mobile still need manual verification.
- The app listens on the loopback address by default. HTML parsing, formula detection, and image generation run in your browser. Word conversion runs on your machine.

## License

[MIT](LICENSE). The plugin bundle includes its third-party license notices.
