import express from 'express';
import path from 'path';
import { chatSafeImageDirs } from '../../shared/artifact-retention.js';

export function createChatImageRouter(dirs: string[] = chatSafeImageDirs()): express.Router {
  const router = express.Router();
  const roots = dirs.length > 0 ? dirs : [path.resolve('./chat-images')];
  for (const root of roots) {
    router.use(express.static(root, {
      dotfiles: 'deny',
      setHeaders: (res) => { res.setHeader('Cache-Control', 'no-store'); },
    }));
  }
  return router;
}
