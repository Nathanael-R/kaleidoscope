import chokidar, { FSWatcher } from 'chokidar';
import path from 'path';

export interface WatcherConfig {
  paths: string[];
  ignored?: string[];
  debounceMs?: number;
  persistent?: boolean;
}

export interface FileChangeEvent {
  type: 'add' | 'change' | 'unlink';
  path: string;
  timestamp: Date;
}

type ChangeHandler = (event: FileChangeEvent) => void;

class WatcherService {
  private watchers: Map<string, FSWatcher> = new Map();
  private handlers: Map<string, ChangeHandler[]> = new Map();
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Start watching a directory or set of paths
   */
  watch(
    id: string,
    config: WatcherConfig,
    handler: ChangeHandler
  ): void {
    // Stop existing watcher if any
    if (this.watchers.has(id)) {
      this.unwatch(id);
    }

    const {
      paths,
      ignored = [
        '**/node_modules/**',
        '**/.git/**',
        '**/dist/**',
        '**/build/**',
        '**/.next/**',
        '**/.cache/**',
        '**/coverage/**'
      ],
      debounceMs = 500,
      persistent = true
    } = config;

    // Create watcher
    const watcher = chokidar.watch(paths, {
      ignored,
      persistent,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100
      }
    });

    // Store handler
    if (!this.handlers.has(id)) {
      this.handlers.set(id, []);
    }
    this.handlers.get(id)!.push(handler);

    // Set up event handlers with debouncing
    const createHandler = (type: FileChangeEvent['type']) => {
      return (filePath: string) => {
        // Clear existing timer
        const timerKey = `${id}:${filePath}`;
        if (this.debounceTimers.has(timerKey)) {
          clearTimeout(this.debounceTimers.get(timerKey)!);
        }

        // Set new timer
        const timer = setTimeout(() => {
          const event: FileChangeEvent = {
            type,
            path: filePath,
            timestamp: new Date()
          };

          console.log(`[Watcher:${id}] ${type}: ${path.basename(filePath)}`);

          // Call all handlers for this watcher
          const handlers = this.handlers.get(id) || [];
          handlers.forEach(h => h(event));

          this.debounceTimers.delete(timerKey);
        }, debounceMs);

        this.debounceTimers.set(timerKey, timer);
      };
    };

    watcher
      .on('add', createHandler('add'))
      .on('change', createHandler('change'))
      .on('unlink', createHandler('unlink'))
      .on('error', (error) => {
        console.error(`[Watcher:${id}] Error:`, error);
      })
      .on('ready', () => {
        console.log(`[Watcher:${id}] Ready. Watching ${paths.join(', ')}`);
      });

    this.watchers.set(id, watcher);
  }

  /**
   * Stop watching
   */
  async unwatch(id: string): Promise<void> {
    const watcher = this.watchers.get(id);
    if (watcher) {
      await watcher.close();
      this.watchers.delete(id);
      this.handlers.delete(id);

      // Clear any pending timers
      Array.from(this.debounceTimers.keys())
        .filter(key => key.startsWith(`${id}:`))
        .forEach(key => {
          clearTimeout(this.debounceTimers.get(key)!);
          this.debounceTimers.delete(key);
        });

      console.log(`[Watcher:${id}] Stopped`);
    }
  }

  /**
   * Stop all watchers
   */
  async unwatchAll(): Promise<void> {
    const ids = Array.from(this.watchers.keys());
    await Promise.all(ids.map(id => this.unwatch(id)));
  }

  /**
   * Check if a watcher is active
   */
  isWatching(id: string): boolean {
    return this.watchers.has(id);
  }

  /**
   * Get all active watcher IDs
   */
  getActiveWatchers(): string[] {
    return Array.from(this.watchers.keys());
  }

  /**
   * Create a watcher for a typical web project
   */
  watchProject(projectPath: string, handler: ChangeHandler): void {
    this.watch('project', {
      paths: [
        path.join(projectPath, 'src/**/*'),
        path.join(projectPath, 'public/**/*'),
        path.join(projectPath, '*.html'),
        path.join(projectPath, '*.css'),
        path.join(projectPath, '*.js'),
        path.join(projectPath, '*.ts'),
        path.join(projectPath, '*.tsx'),
        path.join(projectPath, '*.jsx')
      ],
      debounceMs: 500
    }, handler);
  }
}

// Singleton instance
export const watcherService = new WatcherService();

// Cleanup on process exit
process.on('SIGINT', async () => {
  console.log('Stopping all watchers...');
  await watcherService.unwatchAll();
});

process.on('SIGTERM', async () => {
  console.log('Stopping all watchers...');
  await watcherService.unwatchAll();
});
