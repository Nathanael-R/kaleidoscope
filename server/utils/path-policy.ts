import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

export const WORKSPACE_ROOT_ENV = 'KALEIDOSCOPE_WORKSPACE_ROOT';
export const ARTIFACT_ROOT_ENV = 'KALEIDOSCOPE_ARTIFACT_ROOT';

export interface BoundedPathResult {
  ok: boolean;
  path?: string;
  error?: string;
}

export function getWorkspaceRoot(): string {
  return path.resolve(process.env[WORKSPACE_ROOT_ENV]?.trim() || process.cwd());
}

export function getArtifactRoot(): string {
  return path.resolve(process.env[ARTIFACT_ROOT_ENV]?.trim() || process.cwd());
}

export function isPathInside(baseDir: string, targetPath: string): boolean {
  const relative = path.relative(path.resolve(baseDir), path.resolve(targetPath));
  return relative === '' || (relative.length > 0 && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function containsTraversal(input: string): boolean {
  return input.split(/[\\/]+/).some((segment) => segment === '..');
}

export function resolveBoundedPath(
  input: string,
  options: {
    root: string;
    label: string;
    mustExist?: boolean;
    mustBeDirectory?: boolean;
  },
): BoundedPathResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, error: `${options.label} is required.` };
  }

  if (trimmed.includes('\0')) {
    return { ok: false, error: `${options.label} contains an invalid null byte.` };
  }

  if (containsTraversal(trimmed)) {
    return { ok: false, error: `${options.label} must not contain '..' path traversal segments.` };
  }

  const root = path.resolve(options.root);
  const resolved = path.resolve(root, trimmed);
  if (!isPathInside(root, resolved)) {
    return {
      ok: false,
      error: `${options.label} must be inside ${path.basename(root) || 'the configured root directory'}.`,
    };
  }

  if (options.mustExist && !existsSync(resolved)) {
    return { ok: false, error: `${options.label} does not exist.` };
  }

  if (options.mustBeDirectory) {
    try {
      if (!statSync(resolved).isDirectory()) {
        return { ok: false, error: `${options.label} must be a directory.` };
      }
    } catch {
      return { ok: false, error: `${options.label} could not be inspected.` };
    }
  }

  return { ok: true, path: resolved };
}

export function resolveSourceDirectory(input: string): BoundedPathResult {
  return resolveBoundedPath(input, {
    root: getWorkspaceRoot(),
    label: 'sourceDir',
    mustExist: true,
    mustBeDirectory: true,
  });
}

