import { Router } from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import { watcherService } from '../services/watcher.service.js';
import type { WatcherConfig } from '../services/watcher.service.js';
import { sseService } from '../services/sse.service.js';
import { sendError } from '../utils/http.js';

const router = Router();

// Only allow watching paths under the current working directory
const ALLOWED_BASE = process.cwd();
const WATCHER_EVENT_CLIENT_ID_REGEX = /^[A-Za-z0-9._-]{16,128}$/;

function getWatchPathBase(pattern: string): string {
  const normalizedPattern = pattern.replace(/\\/g, '/');
  const globIndex = normalizedPattern.search(/[\*\?\[{]/);
  const basePattern = globIndex === -1 ? normalizedPattern : normalizedPattern.slice(0, globIndex);
  const trimmedBase = basePattern.replace(/[\/]+$/, '');
  return trimmedBase.length > 0 ? trimmedBase : '.';
}

export function validateWatchPaths(paths: string[], allowedBase: string = ALLOWED_BASE): string | null {
  for (const p of paths) {
    const resolved = path.resolve(getWatchPathBase(p));
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
        console.log(`File ${event.type}: ${event.path}`);
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
    console.error('Error starting watcher:', error);
    return sendError(res, 500, error instanceof Error ? error.message : 'Failed to start watcher');
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
    console.error('Error stopping watcher:', error);
    return sendError(res, 500, error instanceof Error ? error.message : 'Failed to stop watcher');
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
    console.error('Error stopping watchers:', error);
    return sendError(res, 500, error instanceof Error ? error.message : 'Failed to stop watchers');
  }
});

export default router;
