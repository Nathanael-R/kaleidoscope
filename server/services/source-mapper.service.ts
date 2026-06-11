import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export interface SourceHint {
  /** Relative path from sourceDir */
  file: string;
  /** 1-based line number */
  line: number;
  /** The source code on that line (trimmed) */
  code: string;
  /** Suggested replacement code */
  suggestion: string;
}

const SOURCE_EXTENSIONS = new Set([
  '.html', '.htm', '.jsx', '.tsx', '.vue', '.svelte',
  '.js', '.ts', '.php', '.erb', '.ejs', '.hbs', '.pug',
  '.astro', '.mdx',
]);

const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt',
  'coverage', '.cache', '__pycache__', 'vendor',
]);

const MAX_SOURCE_FILES = 500;
const MAX_SOURCE_FILE_BYTES = 500_000;
const MAX_TOTAL_SOURCE_BYTES = 25_000_000;

/**
 * Recursively collect source files from a directory.
 */
function collectSourceFiles(dir: string, maxFiles = MAX_SOURCE_FILES): string[] {
  const files: string[] = [];
  let totalBytes = 0;

  function walk(current: string) {
    if (files.length >= maxFiles) return;
    let entries;
    try {
      entries = readdirSync(current);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files.length >= maxFiles) return;
      if (IGNORE_DIRS.has(entry)) continue;
      const fullPath = join(current, entry);
      let stat;
      try {
        stat = statSync(fullPath);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (stat.isFile()) {
        const ext = entry.substring(entry.lastIndexOf('.'));
        if (
          SOURCE_EXTENSIONS.has(ext)
          && stat.size < MAX_SOURCE_FILE_BYTES
          && totalBytes + stat.size <= MAX_TOTAL_SOURCE_BYTES
        ) {
          files.push(fullPath);
          totalBytes += stat.size;
        }
      }
    }
  }

  walk(dir);
  return files;
}

interface IssueContext {
  type: string;
  element?: string;
  value?: string;
}

/**
 * Extract search patterns from an element selector.
 * e.g. "#hero" → ["id=\"hero\"", "id='hero'", "id={\"hero\"}"]
 * e.g. "img.banner" → ["class=\"banner\"", "className=\"banner\""]
 */
function selectorToPatterns(selector: string): RegExp[] {
  const patterns: RegExp[] = [];

  // ID selector: #foo
  const idMatch = selector.match(/#([\w-]+)/);
  if (idMatch) {
    const id = idMatch[1];
    patterns.push(new RegExp(`id\\s*=\\s*["'{]?${escapeRegex(id)}`, 'i'));
  }

  // Class selector: .foo or tag.foo
  const classMatch = selector.match(/\.([\w-]+)/);
  if (classMatch) {
    const cls = classMatch[1];
    patterns.push(new RegExp(`class(?:Name)?\\s*=\\s*["'{]?[^"'>]*${escapeRegex(cls)}`, 'i'));
  }

  // Tag: img, script, link
  const tagMatch = selector.match(/^(\w+)/);
  if (tagMatch && !idMatch && !classMatch) {
    patterns.push(new RegExp(`<${escapeRegex(tagMatch[1])}[\\s>]`, 'i'));
  }

  return patterns;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Search a file's lines for a pattern and return the first match.
 */
function findInFile(
  filePath: string,
  patterns: RegExp[],
  lines: string[],
): { line: number; code: string } | null {
  for (let i = 0; i < lines.length; i++) {
    for (const pattern of patterns) {
      if (pattern.test(lines[i])) {
        return { line: i + 1, code: lines[i].trim() };
      }
    }
  }
  return null;
}

/**
 * Generate a fix suggestion based on issue type and the matched source line.
 */
function generateSuggestion(type: string, code: string, element?: string, value?: string): string {
  switch (type) {
    case 'cls': {
      // Images without dimensions — suggest adding width/height
      if (code.match(/<img\b/i)) {
        // HTML img tag
        const closing = code.match(/\/?>/) ? '' : '';
        return code.replace(
          /(<img\b)/i,
          '$1 width="auto" height="auto"'
        ) + '  /* Add explicit width and height to prevent layout shift */';
      }
      if (code.match(/src\s*=/i)) {
        return code + '\n// Add width and height props to prevent Cumulative Layout Shift';
      }
      return `${code}\n// Add explicit dimensions (width/height) to this element`;
    }

    case 'image-size': {
      // Oversized image — suggest srcset
      if (code.match(/<img\b/i)) {
        return code.replace(
          /(src\s*=\s*["'][^"']+["'])/i,
          '$1\n    srcset="image-small.webp 480w, image-medium.webp 1024w, image-large.webp 1920w"\n    sizes="(max-width: 768px) 100vw, 50vw"'
        ) + '\n/* Serve viewport-appropriate image sizes with srcset */';
      }
      return `${code}\n// Use srcset and sizes attributes, or serve a smaller image for this viewport`;
    }

    case 'render-blocking': {
      // Render-blocking script — add defer
      if (code.match(/<script\b/i) && !code.match(/\b(defer|async)\b/i)) {
        return code.replace(/<script\b/i, '<script defer') +
          '  /* defer stops this script from blocking first paint */';
      }
      // Render-blocking stylesheet — add media or preload
      if (code.match(/<link\b/i) && code.match(/stylesheet/i)) {
        return code.replace(
          /rel\s*=\s*["']stylesheet["']/i,
          'rel="preload" as="style" onload="this.onload=null;this.rel=\'stylesheet\'"'
        ) + '\n/* Preload non-critical CSS to avoid render-blocking */';
      }
      return `${code}\n// Defer or async-load this resource to avoid blocking render`;
    }

    case 'large-resource': {
      const filename = element?.split('/').pop()?.split('?')[0] || '';
      if (filename.match(/\.(png|jpg|jpeg|gif|bmp)$/i)) {
        return `// Convert ${filename} to WebP/AVIF format:\n// npx sharp-cli -i ${filename} -o ${filename.replace(/\.\w+$/, '.webp')} --format webp --quality 80`;
      }
      if (filename.match(/\.(js|ts)$/i)) {
        return `// Consider code-splitting this bundle:\n// import('${filename.replace(/\.\w+$/, '')}').then(module => { /* use module */ })`;
      }
      if (filename.match(/\.css$/i)) {
        return `// Extract critical CSS and lazy-load the rest:\n// <link rel="preload" href="${filename}" as="style" onload="this.rel='stylesheet'">`;
      }
      return `// Compress or split ${filename} — current size exceeds recommended threshold`;
    }

    case 'dom-size': {
      return '// Reduce DOM nodes: virtualize long lists (react-window), paginate content,\n// or lazy-render off-screen sections with Intersection Observer';
    }

    case 'total-weight': {
      return '// Reduce page weight: compress images (WebP/AVIF), tree-shake JS,\n// lazy-load below-fold content, enable gzip/brotli on the server';
    }

    default:
      return `// Review and optimize this code to improve ${type}`;
  }
}

/**
 * Given source-resolution issues and a source directory, try to find the
 * exact source line for each issue and generate a fix suggestion.
 */
export function mapIssuesToSource(
  issues: IssueContext[],
  sourceDir: string,
): Map<number, SourceHint> {
  const hints = new Map<number, SourceHint>();
  const files = collectSourceFiles(sourceDir);

  // Pre-read and cache file contents
  const fileCache = new Map<string, string[]>();
  for (const filePath of files) {
    try {
      const content = readFileSync(filePath, 'utf-8');
      fileCache.set(filePath, content.split('\n'));
    } catch {
      // skip unreadable files
    }
  }

  for (let i = 0; i < issues.length; i++) {
    const issue = issues[i];
    if (!issue.element) continue;

    // Build search patterns from the element selector or URL
    let patterns: RegExp[];
    if (issue.element.startsWith('http')) {
      // Resource URL — search for the filename
      const filename = issue.element.split('/').pop()?.split('?')[0];
      if (!filename) continue;
      patterns = [new RegExp(escapeRegex(filename), 'i')];
    } else {
      patterns = selectorToPatterns(issue.element);
    }

    if (patterns.length === 0) continue;

    // Search files for the first match
    for (const [filePath, lines] of fileCache) {
      const match = findInFile(filePath, patterns, lines);
      if (match) {
        const relPath = relative(sourceDir, filePath);
        hints.set(i, {
          file: relPath,
          line: match.line,
          code: match.code,
          suggestion: generateSuggestion(issue.type, match.code, issue.element, issue.value),
        });
        break;
      }
    }
  }

  return hints;
}

export function findSourceHint(element: string, sourceDir: string, type = 'inspect'): SourceHint | null {
  if (!element.trim()) {
    return null;
  }

  return mapIssuesToSource([{ type, element }], sourceDir).get(0) ?? null;
}
