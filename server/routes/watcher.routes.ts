import { Router } from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import { watcherService } from '../services/watcher.service.js';
import type { WatcherConfig } from '../services/watcher.service.js';
import { sseService } from '../services/sse.service.js';
import { sendError } from '../utils/http.js';
import { logServerError } from '../utils/logger.js';

const router = Router();

// Only allow watching paths under the current working directory
const ALLOWED_BASE = process.cwd();
const WATCHER_EVENT_CLIENT_ID_REGEX = /^[A-Za-z0-9._-]{16,128}$/;
const WATCHER_ID_REGEX = /^[A-Za-z0-9._-]{1,80}$/;
const MAX_WATCH_PATHS = 25;
const MAX_WATCH_PATTERN_LENGTH = 500;

function getWatchPathBase(pattern: string): string {
  const normalizedPattern = pattern.replace(/\\/g, '/');
  const globIndex = normalizedPattern.search(/[\*\?\[{]/);
  const basePattern = globIndex === -1 ? normalizedPattern : normalizedPattern.slice(0, globIndex);
  const trimmedBase = basePattern.replace(/[\/]+$/, '');
  return trimmedBase.length > 0 ? trimmedBase : '.';
}

export function validateWatchPaths(paths: string[], allowedBase: string = ALLOWED_BASE): string | null {
  for (const p of paths) {
    if (typeof p !== 'string' || p.trim().length === 0 || p.length > MAX_WATCH_PATTERN_LENGTH) {
      return `Path entries must be non-empty strings of ${MAX_WATCH_PATTERN_LENGTH} characters or fewer`;
    }

    const resolved = path.resolve(allowedBase, getWatchPathBase(p));
    const relative = path.relative(allowedBase, resolved);

    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      return `Path "${p}" is outside the allowed directory`;
    }

    if (p.includes('..')) {
      return `Path "${p}" contains disallowed traversal`;
    }
  }
  return null;
}

/**
 * POST /api/watcher/start
 * Start watching files
 */
router.post('/start', (req: Request, res: Response) => {
  try {
    const { id = 'default', paths, ignored, debounceMs, eventClientId } = req.body as WatcherConfig & {
      id?: string;
      eventClientId?: string;
    };

    if (!paths || !Array.isArray(paths) || paths.length === 0) {
      return sendError(res, 400, 'paths array is required');
    }

    if (paths.length > MAX_WATCH_PATHS) {
      return sendError(res, 400, `Maximum ${MAX_WATCH_PATHS} watch paths per request`);
    }

    if (typeof id !== 'string' || !WATCHER_ID_REGEX.test(id)) {
      return sendError(res, 400, 'id must contain only letters, numbers, dots, underscores, or dashes');
    }

    if (debounceMs !== undefined && (!Number.isInteger(debounceMs) || debounceMs < 0 || debounceMs > 60_000)) {
      return sendError(res, 400, 'debounceMs must be an integer between 0 and 60000');
    }

    if (
      ignored !== undefined
      && (!Array.isArray(ignored) || ignored.some((entry) => typeof entry !== 'string' || entry.length > MAX_WATCH_PATTERN_LENGTH))
    ) {
      return sendError(res, 400, 'ignored must be an array of safe glob strings when provided');
    }

    if (typeof eventClientId !== 'string' || !WATCHER_EVENT_CLIENT_ID_REGEX.test(eventClientId)) {
      return sendError(res, 400, 'eventClientId is required');
    }

    const pathError = validateWatchPaths(paths);
    if (pathError) {
      return sendError(res, 400, pathError);
    }

    watcherService.watch(
      id,
      { paths, ignored, debounceMs },
      (event) => {
        console.log(`File ${event.type}: ${path.basename(event.path)}`);
        sseService.sendToClient(eventClientId, 'reload', {
          watcherId: id,
          timestamp: Date.now(),
        });
      }
    );

    res.json({
      success: true,
      message: `Started watching ${paths.length} path(s)`,
      watcherId: id
    });
  } catch (error) {
    logServerError(error, {
      requestId: res.locals.requestId as string | undefined,
      path: req.path,
      method: req.method,
    });
    return sendError(res, 500, 'Failed to start watcher');
  }
});

/**
 * DELETE /api/watcher/stop/:id
 * Stop watching files
 */
router.delete('/stop/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await watcherService.unwatch(id);

    res.json({
      success: true,
      message: `Stopped watcher: ${id}`
    });
  } catch (error) {
    logServerError(error, {
      requestId: res.locals.requestId as string | undefined,
      path: req.path,
      method: req.method,
    });
    return sendError(res, 500, 'Failed to stop watcher');
  }
});

/**
 * GET /api/watcher
 * Get all active watchers
 */
router.get('/', (req: Request, res: Response) => {
  const watchers = watcherService.getActiveWatchers();

  res.json({
    success: true,
    watchers,
    count: watchers.length
  });
});

/**
 * DELETE /api/watcher
 * Stop all watchers
 */
router.delete('/', async (req: Request, res: Response) => {
  try {
    await watcherService.unwatchAll();

    res.json({
      success: true,
      message: 'All watchers stopped'
    });
  } catch (error) {
    logServerError(error, {
      requestId: res.locals.requestId as string | undefined,
      path: req.path,
      method: req.method,
    });
    return sendError(res, 500, 'Failed to stop watchers');
  }
});

export default router;
