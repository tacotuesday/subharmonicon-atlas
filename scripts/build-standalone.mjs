import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const dist = resolve('dist');
let html = await readFile(resolve(dist, 'index.html'), 'utf8');
// The hosted entry also opens correctly if a musician opens dist/index.html directly.
html = html.replaceAll('./dist/standalone.html', './standalone.html');
await writeFile(resolve(dist, 'index.html'), html);
let standalone = html.replace(/<script id="local-file-launcher">[\s\S]*?<\/script>/, '');
const scripts = [...standalone.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g)];
if (scripts.length !== 1) throw new Error('Expected one bundled app entry for the standalone build.');
for (const [tag, source] of scripts) {
  if (!source.startsWith('./assets/')) throw new Error('Standalone app assets must be local.');
  const code = await readFile(resolve(dist, source), 'utf8');
  standalone = standalone.replace(tag, '');
  // Classic scripts execute immediately; mount only after #root has been parsed.
  standalone = standalone.replace('</body>', () => `<script>${code.replaceAll('</script', '<\\/script')}</script></body>`);
}
for (const [tag, source] of [...standalone.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g)]) {
  if (!source.startsWith('./assets/')) throw new Error('Standalone styles must be local.');
  const css = await readFile(resolve(dist, source), 'utf8');
  standalone = standalone.replace(tag, () => `<style>${css.replaceAll('</style', '<\\/style')}</style>`);
}
const icon = await readFile(resolve(dist, 'favicon.svg'));
standalone = standalone.replace('href="./favicon.svg"', `href="data:image/svg+xml;base64,${icon.toString('base64')}"`);
await writeFile(resolve(dist, 'standalone.html'), standalone);
console.log('Built dist/standalone.html — opens directly without a server.');
