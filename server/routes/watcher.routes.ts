import { Router } from 'express';
import type { Request, Response } from 'express';
import { watcherService } from '../services/watcher.service.js';
import type { WatcherConfig } from '../services/watcher.service.js';

const router = Router();

/**
 * POST /api/watcher/start
 * Start watching files
 */
router.post('/start', (req: Request, res: Response) => {
  try {
    const { id = 'default', paths, ignored, debounceMs } = req.body as WatcherConfig & { id?: string };

    if (!paths || !Array.isArray(paths) || paths.length === 0) {
      return res.status(400).json({
        error: 'paths array is required'
      });
    }

    // Note: Handler will emit via WebSocket (set up in index.ts)
    watcherService.watch(
      id,
      { paths, ignored, debounceMs },
      (event) => {
        // Emit event via WebSocket
        console.log(`File ${event.type}: ${event.path}`);
      }
    );

    res.json({
      success: true,
      message: `Started watching ${paths.length} path(s)`,
      watcherId: id
    });
  } catch (error) {
    console.error('Error starting watcher:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to start watcher'
    });
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
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to stop watcher'
    });
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
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to stop watchers'
    });
  }
});

export default router;
