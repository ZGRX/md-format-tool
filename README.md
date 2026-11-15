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

Open the local address shown in your terminal, usually [http://127.0.0.1:5173/](http://127.0.0.1:5173/). Run `npm test` to check format detection and round-trip conversion. Use `npm run build` to build the app and `npm run preview` to try the build. Word export in the preview also uses your local Pandoc installation.

Word export requires [Pandoc](https://pandoc.org/installing.html). The app looks for Pandoc in your PATH, in `.tools/pandoc-*/bin/pandoc`, or at the path set in `PANDOC_PATH`.

### Export options

- **Review and repair formulas.** The built-in linear algebra example has seven repairs selected, with the variable `(n)` left for you to review. For new imports, select the suggested repairs for ambiguous parentheses and brackets. The app automatically standardizes recognized LaTeX delimiters. You can inspect the original text or HTML and restore the imported content.
- **Share to WeChat.** Copy paragraphs, lists, and tables as chat text, or download PNGs at 1040 px or 1440 px wide. Multiple pages are bundled in a ZIP. Long tables split across pages and repeat their headers. Extra-wide content scales to fit.
- **Export to Word.** DOCX files use Word heading styles, native tables, and editable OMML equations by default. You can export equations as images or keep the LaTeX source where KaTeX reports an error. The browser sends the content to Pandoc through a local HTTP endpoint and downloads the generated file.
- **Export Markdown.** Preview the rendered note or its source, then copy or download it. Exports use dollar-sign math delimiters and Markdown table syntax supported by Obsidian.

## Build the plugin from source

Run `npm ci` and `npm run build:obsidian`, then copy the three plugin files from `obsidian/dist/md-format-tool/` into your vault as described above.

## Current limitations

- Recovering formulas from pasted HTML requires LaTeX annotations or `data-latex` or `data-tex` attributes in the clipboard content. Complex embeds and attachment folders have limited support. The preview and image exports render supported embedded raster images. Other images appear as placeholders, and Markdown exports keep their original URLs.
- The browser's Word preview shows content and structure. Word determines the final pagination. The sample DOCX has been checked for eight OMML equations, three boxed formulas, and a native table. Microsoft Word, WPS, Obsidian, and WeChat on mobile still need manual verification.
- The app listens on the loopback address by default. HTML parsing, formula detection, and image generation run in your browser. Word conversion runs on your machine.

## License

[MIT](LICENSE). The plugin bundle includes its third-party license notices.
