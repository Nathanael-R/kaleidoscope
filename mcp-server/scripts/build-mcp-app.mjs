import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDir, '..');
const sourceRoot = resolve(packageRoot, 'app', 'results');
const harnessRoot = resolve(packageRoot, 'app', 'harness');
const outputPath = resolve(packageRoot, 'dist', 'apps', 'results.html');
const harnessOutputPath = resolve(packageRoot, 'dist', 'apps', 'harness.html');
const demoOutputPath = resolve(packageRoot, 'dist', 'apps', 'demo-host.html');

const [htmlTemplate, css, harnessTemplate, harnessCss, javascriptBuild, harnessJavascriptBuild] = await Promise.all([
  readFile(resolve(sourceRoot, 'index.html'), 'utf8'),
  readFile(resolve(sourceRoot, 'styles.css'), 'utf8'),
  readFile(resolve(harnessRoot, 'index.html'), 'utf8'),
  readFile(resolve(harnessRoot, 'styles.css'), 'utf8'),
  build({
    entryPoints: [resolve(sourceRoot, 'app.ts')],
    bundle: true,
    format: 'iife',
    minify: true,
    target: 'es2022',
    write: false,
  }),
  build({
    entryPoints: [resolve(harnessRoot, 'entry.ts')],
    bundle: true,
    format: 'iife',
    minify: true,
    target: 'es2022',
    write: false,
  }),
]);

const javascript = javascriptBuild.outputFiles[0]?.text;
const harnessJavascript = harnessJavascriptBuild.outputFiles[0]?.text;
if (!javascript || !harnessJavascript) {
  throw new Error('MCP App or reference harness JavaScript bundle was not produced.');
}

const html = htmlTemplate
  .replace('__KALEIDOSCOPE_APP_CSS__', css)
  .replace('__KALEIDOSCOPE_APP_JS__', javascript);
const harnessHtml = harnessTemplate
  .replace('__MCP_APPS_HARNESS_CSS__', harnessCss)
  .replace('__MCP_APPS_HARNESS_JS__', harnessJavascript);

await mkdir(dirname(outputPath), { recursive: true });
await Promise.all([
  writeFile(outputPath, html, 'utf8'),
  writeFile(harnessOutputPath, harnessHtml, 'utf8'),
  writeFile(demoOutputPath, harnessHtml, 'utf8'),
]);
console.log(`Built Kaleidoscope MCP App and provider-neutral reference harness at ${dirname(outputPath)}`);
