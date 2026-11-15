import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import JSZip from 'jszip'

const root = fileURLToPath(new URL('../', import.meta.url))
const source = join(root, 'obsidian')
const output = join(source, 'dist')
const manifest = JSON.parse(await readFile(join(source, 'manifest.json'), 'utf8'))
const plugin = join(output, manifest.id)

await mkdir(plugin, { recursive: true })
await build({
  absWorkingDir: root,
  entryPoints: ['obsidian/main.ts'],
  bundle: true,
  external: ['obsidian'],
  format: 'cjs',
  platform: 'browser',
  target: 'es2023',
  minify: true,
  outfile: join(plugin, 'main.js'),
})
await Promise.all(['manifest.json', 'styles.css'].map((file) =>
  copyFile(join(source, file), join(plugin, file)),
))

const zip = new JSZip()
for (const file of ['main.js', 'manifest.json', 'styles.css']) {
  zip.file(manifest.id + '/' + file, await readFile(join(plugin, file)))
}
const archive = join(output, manifest.id + '-' + manifest.version + '.zip')
await writeFile(archive, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }))
console.log(archive)
