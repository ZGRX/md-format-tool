# Markdown Format Tool

English · [简体中文](README.zh-CN.md)

Format AI-generated content on your machine. Paste plain text, Markdown, or structured content from a web page, or import a single `.md` file. Review suggested formula repairs alongside the source and export the result for WeChat, Word, or Obsidian.

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

## Current limitations

- Recovering formulas from pasted HTML requires LaTeX annotations or `data-latex` or `data-tex` attributes in the clipboard content. Complex embeds and attachment folders have limited support. The preview and image exports render supported embedded raster images. Other images appear as placeholders, and Markdown exports keep their original URLs.
- The browser's Word preview shows content and structure. Word determines the final pagination. The sample DOCX has been checked for eight OMML equations, three boxed formulas, and a native table. Microsoft Word, WPS, Obsidian, and WeChat on mobile still need manual verification.
- The app listens on the loopback address by default. HTML parsing, formula detection, and image generation run in your browser. Word conversion runs on your machine.
