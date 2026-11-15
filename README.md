# Markdown Format Tool

English · [简体中文](README.zh-CN.md)

Paste LaTeX into an Obsidian note and the plugin automatically repairs recognizable math formatting. The companion web app previews and formats Markdown for export to Word or WeChat.

## Obsidian plugin

### Install in Obsidian

Open the [Obsidian Community listing](https://community.obsidian.md/plugins/md-format-tool) and select **Add to Obsidian**. If it does not appear in your app’s plugin browser, use the manual installation steps below. Obsidian 1.8.7 or later is required.

**Manual installation.** Download `main.js`, `manifest.json`, and `styles.css` from the [latest GitHub release](https://github.com/ZGRX/md-format-tool/releases/latest). Place all three in `.obsidian/plugins/md-format-tool/` inside your vault and enable **Markdown Format Tool** under **Settings → Community plugins**.

### Try a paste

Paste this line into an Obsidian note with **⌘V** or **Ctrl+V**:

```text
The roots are \(x=\pm1\).
```

The plugin inserts this Markdown, which Obsidian renders as an equation:

```markdown
The roots are $x=\pm1$.
```

### Review repairs with the command palette

- **Paste and repair Markdown** opens a paste box and lets you review repairs before inserting content at the cursor or replacing a selection.
- **Repair selection or current note** checks the selection, or the current note if there is no selection. It shows ambiguous formulas before you choose which ones to repair.

The command labels follow Obsidian's language setting for English and Chinese, and all conversion runs locally.

## Run the companion web app

Use a Node.js version that meets [Vite's requirements](https://vite.dev/guide/).

```sh
npm ci
npm run dev
```

Open the local address shown in your terminal, usually [http://127.0.0.1:5173/](http://127.0.0.1:5173/).

Word export requires [Pandoc](https://pandoc.org/installing.html). The app looks for Pandoc in your PATH, in `.tools/pandoc-*/bin/pandoc`, or at the path set in `PANDOC_PATH`.

### Export options

- **Review and repair formulas.** The built-in linear algebra example has seven repairs selected, with the variable `(n)` left for you to review. For new imports, select the suggested repairs for ambiguous parentheses and brackets. The app automatically standardizes recognized LaTeX delimiters. You can inspect the original text or HTML and restore the imported content.
- **Share to WeChat.** Copy paragraphs, lists, and tables as chat text, or download PNGs at 1040 px or 1440 px wide. Multiple pages are bundled in a ZIP. Long tables split across pages and repeat their headers. Extra-wide content scales to fit.
- **Export to Word.** DOCX files use Word heading styles, native tables, and editable OMML equations by default. You can export equations as images or keep the LaTeX source where KaTeX reports an error. The browser sends the content to Pandoc through a local HTTP endpoint and downloads the generated file.
- **Export Markdown.** Preview the rendered note or its source, then copy or download it. Exports use dollar-sign math delimiters and Markdown table syntax supported by Obsidian.

## Developer guide

### Build and test the Obsidian plugin

The release workflow uses Node.js 22. To get a fresh copy and build it locally, run:

```sh
git clone https://github.com/ZGRX/md-format-tool.git
cd md-format-tool
npm ci
npm test
npm run build:obsidian
```

1. Copy `main.js`, `manifest.json`, and `styles.css` from `obsidian/dist/md-format-tool/` to `.obsidian/plugins/md-format-tool/` inside a test vault.
2. Enable **Markdown Format Tool** under **Settings → Community plugins**. After each rebuild, copy the three files again, then turn the plugin off and back on.
3. Paste the [example above](#try-a-paste) into a test note. When changing formula detection, also paste ordinary text, a fenced code block, and Markdown with an existing formula to check that the plugin preserves them.

For the web app, use `npm run dev` as described above. Run `npm run build` to build both the web app and plugin, and `npm run preview` to preview the built web app. Word export in the preview uses your local Pandoc installation.

### Where to make changes

| File | What it does |
| --- | --- |
| [`obsidian/main.ts`](obsidian/main.ts) | Handles Obsidian paste events, registers commands, and writes repairs back to the editor. |
| [`obsidian/paste.ts`](obsidian/paste.ts) | Chooses clipboard content and decides which repairs to apply on paste. |
| [`src/format.ts`](src/format.ts) and [`src/import-html.ts`](src/import-html.ts) | Detect formulas and convert rich clipboard HTML to Markdown. Both the plugin and web app use these modules. |
| [`src/app.tsx`](src/app.tsx) and [`src/export.ts`](src/export.ts) | Implement the web interface and export options. |
| [`tests/format.test.ts`](tests/format.test.ts) | Covers formula detection, paste behavior, and Markdown that the formatter should preserve. |

When reporting a paste bug, include the source app, a small sample you can share, and the actual and expected Markdown. For a fix to formula detection or paste behavior, add the sample to the regression tests and run `npm test`.

## Current limitations

- Recovering formulas from pasted HTML requires LaTeX annotations or `data-latex` or `data-tex` attributes in the clipboard content. Complex embeds and attachment folders have limited support. The preview and image exports render supported embedded raster images. Other images appear as placeholders, and Markdown exports keep their original URLs.
- The browser's Word preview shows content and structure. Word determines the final pagination. The sample DOCX has been checked for eight OMML equations, three boxed formulas, and a native table. Microsoft Word, WPS, Obsidian, and WeChat on mobile still need manual verification.
- The app listens on the loopback address by default. HTML parsing, formula detection, and image generation run in your browser. Word conversion runs on your machine.

## License

[MIT](LICENSE). The plugin bundle includes its third-party license notices.
