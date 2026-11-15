import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import JSZip from 'jszip'

const root = fileURLToPath(new URL('../', import.meta.url))
const source = join(root, 'obsidian')
const output = join(source, 'dist')
const manifestPath = join(root, 'manifest.json')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
const plugin = join(output, manifest.id)

await mkdir(plugin, { recursive: true })
const { metafile, outputFiles } = await build({
  absWorkingDir: root,
  entryPoints: ['obsidian/main.ts'],
  bundle: true,
  external: ['obsidian'],
  format: 'cjs',
  platform: 'browser',
  target: 'es2023',
  minify: true,
  metafile: true,
  write: false,
  outfile: join(root, 'main.js'),
})

const dependencies = new Set()
for (const path of Object.keys(metafile.inputs)) {
  const dependency = path.match(/^(.*node_modules\/(?:@[^/]+\/)?[^/]+)\//)?.[1]
  if (dependency) dependencies.add(dependency)
}

const licenses = new Map()
for (const dependency of [...dependencies].sort()) {
  const directory = join(root, dependency)
  const { name } = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'))
  const files = (await readdir(directory)).filter((file) => /^(licen[cs]e|copying|notice)(\.|$)/i.test(file)).sort()
  // The published remark-math package omits its upstream license file.
  const paths = files.length ? files.map((file) => join(directory, file)) : [join(source, 'licenses', name + '.txt')]
  for (const path of paths) {
    const notice = (await readFile(path, 'utf8')).replace(/\r\n/g, '\n').trim()
    if (!licenses.has(notice)) licenses.set(notice, [])
    licenses.get(notice).push(name)
  }
}

const ownLicense = (await readFile(join(root, 'LICENSE'), 'utf8')).trim()
const notices = [...licenses].map(([license, names]) => names.join(', ') + '\n\n' + license)
const legal = [ownLicense, ...notices].join('\n\n--------------------\n\n').replaceAll('*/', '* /')
const code = outputFiles[0].text + '\n/*!\n' + legal + '\n*/\n'
await Promise.all([
  writeFile(join(root, 'main.js'), code),
  writeFile(join(plugin, 'main.js'), code),
  copyFile(manifestPath, join(plugin, 'manifest.json')),
  copyFile(join(source, 'styles.css'), join(plugin, 'styles.css')),
])

const zip = new JSZip()
for (const file of ['main.js', 'manifest.json', 'styles.css']) {
  zip.file(manifest.id + '/' + file, await readFile(join(plugin, file)))
}
const archive = join(output, manifest.id + '-' + manifest.version + '.zip')
await writeFile(archive, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }))
console.log(archive)
